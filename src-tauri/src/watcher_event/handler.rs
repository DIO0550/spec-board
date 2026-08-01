//! `FsEvent` を active `ProjectSession` へ反映し、既存 wire envelope を emit する。
//!
//! adapter が保持する `ProjectRoot` と `SessionId` の安定ペアは spawn 時から
//! 不変である。各 event は exact-root writer gate の内側で fresh
//! snapshot と session-scoped resources を検証する。project switch や same-path
//! reopen 後の adapter は write-ignore、resident state、eventSeq、emit のどれにも
//! 触れない。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvError};

use crate::project_session::{ProjectSessionSnapshot, SessionIdentity};
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_key::ProjectKey;
use crate::state::tasks_revision::TasksRevision;
use crate::state::{AppStateError, ResourceAccessError, SessionResourceAccess, SessionWriteError};
use crate::task::parse::{
    default_status_for, normalized_task_file_path, task_from_markdown, TaskParseContext,
};
use crate::task::rebuild::rebuild_tasks_from_disk;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::warning::has_parent_cycle_warning;
use spec_board_fs::task::file_scanner::task_md_relative_path;
use spec_board_fs::watcher::core::{FsEvent, WatcherFailure, WatcherFailureKind};

use super::envelope::{
    build_envelope, DiagnosticCode, DiagnosticPayload, EnvelopePayload, ResyncReason,
    ResyncRequiredPayload, TaskDeletedPayload, TaskUpsertPayload, EVENT_DIAGNOSTIC,
    EVENT_RESYNC_REQUIRED, EVENT_TASK_CREATED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED,
};
use super::AdapterContext;

/// full rescan の SessionRevision CAS 再試行上限。
const RESCAN_MAX_ATTEMPTS: u32 = 3;

/// adapter スレッド本体。`Receiver<FsEvent>` を blocking で消費し、
/// Disconnected で抜ける。
pub(crate) fn run_event_loop(rx: Receiver<FsEvent>, ctx: AdapterContext) {
    loop {
        match rx.recv() {
            Ok(event) => {
                if let Err(err) = handle_event(&event, &ctx) {
                    log::warn!("watcher_event handler error: {err}");
                }
            }
            Err(RecvError) => {
                log::trace!("watcher_event channel disconnected; adapter stopping");
                return;
            }
        }
    }
}

/// upsert が emit する event 名の決定方法。
#[derive(Debug, Clone, Copy)]
enum UpsertMode {
    /// cache 存在で updated / created を切り替える通常モード。
    Auto,
    /// rename の to 側を常に created として扱う互換モード。
    ForceCreated,
}

/// 1 件の event を exact-root writer gate 内で処理する。
pub(crate) fn handle_event(event: &FsEvent, ctx: &AdapterContext) -> Result<(), HandleError> {
    let mut before_sequence = || {};
    handle_event_with_sequence_hook(event, ctx, &mut before_sequence)
}

/// commit/validation 後、conditional eventSeq 採番の直前を制御するテスト入口。
#[cfg(test)]
pub(crate) fn handle_event_with_before_sequence(
    event: &FsEvent,
    ctx: &AdapterContext,
    mut before_sequence: impl FnMut(),
) -> Result<(), HandleError> {
    handle_event_with_sequence_hook(event, ctx, &mut before_sequence)
}

fn handle_event_with_sequence_hook(
    event: &FsEvent,
    ctx: &AdapterContext,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    let gate = ctx.state.writer_gate(&ctx.project_root)?;
    let _writer = ctx.state.lock_writer_gate(gate.as_ref())?;

    match event {
        FsEvent::Created(path) | FsEvent::Modified(path) => {
            handle_upsert(path, ctx, UpsertMode::Auto, before_sequence)
        }
        FsEvent::Renamed { from, to } => {
            handle_delete(from, ctx, before_sequence)?;
            handle_upsert(to, ctx, UpsertMode::ForceCreated, before_sequence)
        }
        FsEvent::Removed(path) => handle_delete(path, ctx, before_sequence),
        FsEvent::Other(path) => {
            let Some(snapshot) = fresh_adapter_snapshot(ctx)? else {
                return Ok(());
            };
            let Some(_resources) = resources_for_snapshot(ctx, &snapshot)? else {
                return Ok(());
            };
            log::trace!("watcher_event: ignoring Other event for {}", path.display());
            Ok(())
        }
        FsEvent::Rescan => handle_rescan(ctx, before_sequence),
        FsEvent::Error(failure) => handle_backend_failure(failure, ctx, before_sequence),
    }
}

/// active session がこの adapter の stable root + SessionId と一致する snapshot を返す。
fn fresh_adapter_snapshot(
    ctx: &AdapterContext,
) -> Result<Option<ProjectSessionSnapshot>, HandleError> {
    let Some(snapshot) = ctx.state.session_snapshot()? else {
        log::trace!("watcher_event: dropping event because project state is idle");
        return Ok(None);
    };
    if adapter_matches_snapshot(ctx, &snapshot) {
        return Ok(Some(snapshot));
    }

    log::trace!("watcher_event: dropping event from stale project session");
    Ok(None)
}

fn adapter_matches_snapshot(ctx: &AdapterContext, snapshot: &ProjectSessionSnapshot) -> bool {
    snapshot.project_root() == &ctx.project_root && snapshot.version().session_id == ctx.session_id
}

fn adapter_matches_identity(ctx: &AdapterContext, identity: &SessionIdentity) -> bool {
    identity.project_root() == &ctx.project_root && identity.version().session_id == ctx.session_id
}

/// 非 mutation event 用に identity-checked resource access を取得する。
fn resources_for_snapshot(
    ctx: &AdapterContext,
    snapshot: &ProjectSessionSnapshot,
) -> Result<Option<SessionResourceAccess>, HandleError> {
    match ctx.state.resources_for(snapshot.version()) {
        Ok(resources) => Ok(Some(resources)),
        Err(ResourceAccessError::Conflict(_)) => Ok(None),
        Err(ResourceAccessError::State(AppStateError::NoProjectOpen)) => Ok(None),
        Err(ResourceAccessError::State(error)) => Err(error.into()),
    }
}

/// mutation event 用に revision exhaustion と resource identity を disk I/O 前に検証する。
fn preflight_mutation(
    ctx: &AdapterContext,
    snapshot: &ProjectSessionSnapshot,
) -> Result<Option<SessionResourceAccess>, HandleError> {
    match ctx.state.preflight_session_write(snapshot) {
        Ok(resources) => Ok(Some(resources)),
        Err(
            SessionWriteError::NoProjectOpen
            | SessionWriteError::Conflict(_)
            | SessionWriteError::ResourceConflict(_),
        ) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// scanner と同じ条件を満たす task markdown の正規化相対 path を返す。
fn rel_md_path(abs_path: &Path, root: &Path) -> Option<TaskFilePath> {
    task_md_relative_path(abs_path, root).map(|rel| normalized_task_file_path(&rel))
}

/// metadata が消えた delete/rename-from 向けの軽量 path 検証。
fn rel_md_path_lenient(abs_path: &Path, root: &Path) -> Option<TaskFilePath> {
    let rel = abs_path.strip_prefix(root).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    if abs_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("md"))
        .unwrap_or(true)
    {
        return None;
    }
    for component in rel.iter() {
        let name = component.to_str()?;
        if name.starts_with('.') || name == "node_modules" {
            return None;
        }
    }
    rel.to_str()?;
    Some(normalized_task_file_path(rel))
}

fn handle_upsert(
    abs_path: &Path,
    ctx: &AdapterContext,
    mode: UpsertMode,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    let Some(snapshot) = fresh_adapter_snapshot(ctx)? else {
        return Ok(());
    };
    let Some(resources) = preflight_mutation(ctx, &snapshot)? else {
        return Ok(());
    };
    let Some(rel_path) = rel_md_path(abs_path, ctx.project_root.as_path()) else {
        log::trace!(
            "watcher_event: skipping path excluded by task scanner: {}",
            abs_path.display()
        );
        return Ok(());
    };
    if resources.write_ignore().unregister(abs_path)? {
        return Ok(());
    }

    let bytes = match ctx.io.read(abs_path) {
        Ok(bytes) => bytes,
        Err(err) => {
            log::warn!(
                "watcher_event: failed to read `{}`: {err}",
                abs_path.display()
            );
            return Ok(());
        }
    };
    let context = TaskParseContext {
        file_path: rel_path.as_path_buf(),
        default_status: default_status_for(snapshot.config()),
    };
    let mut task = match task_from_markdown(&bytes, &context) {
        Ok(task) => task,
        Err(err) => {
            log::warn!(
                "watcher_event: failed to parse `{}`: {err}",
                abs_path.display()
            );
            return Ok(());
        }
    };

    let cache_key = PathBuf::from(task.file_path.as_str());
    let event_name = match mode {
        UpsertMode::Auto if snapshot.tasks().contains_key(&cache_key) => EVENT_TASK_UPDATED,
        UpsertMode::Auto | UpsertMode::ForceCreated => EVENT_TASK_CREATED,
    };
    let was_cycle_member = snapshot
        .tasks()
        .get(&cache_key)
        .map(|previous| has_parent_cycle_warning(&previous.warnings))
        .unwrap_or(false);
    task.preserve_parent_cycle_state(was_cycle_member, true);
    let expected = snapshot.identity();
    let committed = match ctx.state.commit_session_write(&expected, move |session| {
        session.tasks_mut().insert(cache_key, task.clone());
        task
    }) {
        Ok(committed) => committed,
        Err(
            SessionWriteError::NoProjectOpen
            | SessionWriteError::Conflict(_)
            | SessionWriteError::ResourceConflict(_),
        ) => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let committed_identity = committed.identity().clone();
    let emitted_task = committed.value;

    emit_compat_envelope(
        ctx,
        &committed_identity,
        event_name,
        TaskUpsertPayload { task: emitted_task },
        before_sequence,
    )
}

/// delete と rename-from を resident session へ反映する。
fn handle_delete(
    abs_path: &Path,
    ctx: &AdapterContext,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    let Some(snapshot) = fresh_adapter_snapshot(ctx)? else {
        return Ok(());
    };
    let Some(resources) = preflight_mutation(ctx, &snapshot)? else {
        return Ok(());
    };
    let Some(rel_path) = rel_md_path_lenient(abs_path, ctx.project_root.as_path()) else {
        return Ok(());
    };
    if resources.write_ignore().unregister(abs_path)? {
        return Ok(());
    }

    let cache_key = rel_path.as_path_buf();
    if !snapshot.tasks().contains_key(&cache_key) {
        log::trace!(
            "watcher_event: ignoring delete for path not in cache: {}",
            abs_path.display()
        );
        return Ok(());
    }
    let expected = snapshot.identity();
    let committed = match ctx.state.commit_session_write(&expected, move |session| {
        session.tasks_mut().remove(&cache_key);
    }) {
        Ok(committed) => committed,
        Err(
            SessionWriteError::NoProjectOpen
            | SessionWriteError::Conflict(_)
            | SessionWriteError::ResourceConflict(_),
        ) => return Ok(()),
        Err(error) => return Err(error.into()),
    };

    emit_compat_envelope(
        ctx,
        committed.identity(),
        EVENT_TASK_DELETED,
        TaskDeletedPayload {
            file_path: rel_path.as_str().to_string(),
        },
        before_sequence,
    )
}

enum RescanCommit {
    Committed(SessionIdentity),
    Retry,
    Stale,
}

/// full rescan を同じ writer gate 内で走査し、full SessionVersion CAS で置換する。
fn handle_rescan(
    ctx: &AdapterContext,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    let mut attempt = 1;
    loop {
        let Some(snapshot) = fresh_adapter_snapshot(ctx)? else {
            return Ok(());
        };
        let Some(resources) = preflight_mutation(ctx, &snapshot)? else {
            return Ok(());
        };
        let default_status = default_status_for(snapshot.config());
        let tasks = match rebuild_tasks_from_disk(
            ctx.project_root.as_path(),
            &default_status,
            ctx.io.as_ref(),
        ) {
            Ok(tasks) => tasks,
            Err(err) => {
                log::warn!("watcher_event: full rescan failed: {err}");
                return emit_diagnostic(
                    ctx,
                    &snapshot.identity(),
                    DiagnosticCode::RescanFailed,
                    &err.to_string(),
                    Vec::new(),
                    before_sequence,
                );
            }
        };
        let cache: HashMap<PathBuf, Task> = tasks
            .into_iter()
            .map(|task| (PathBuf::from(task.file_path.as_str()), task))
            .collect();
        let expected = snapshot.identity();
        let commit = match ctx.state.commit_session_write(&expected, move |session| {
            session.replace_tasks(cache);
        }) {
            Ok(committed) => RescanCommit::Committed(committed.identity().clone()),
            Err(SessionWriteError::Conflict(conflict)) => {
                let current_adapter_session = conflict
                    .actual
                    .as_ref()
                    .is_some_and(|actual| adapter_matches_identity(ctx, actual));
                if current_adapter_session {
                    RescanCommit::Retry
                } else {
                    RescanCommit::Stale
                }
            }
            Err(SessionWriteError::ResourceConflict(conflict)) => {
                let current_adapter_session = conflict
                    .actual()
                    .is_some_and(|actual| actual.session_id == ctx.session_id);
                if current_adapter_session {
                    RescanCommit::Retry
                } else {
                    RescanCommit::Stale
                }
            }
            Err(SessionWriteError::NoProjectOpen) => RescanCommit::Stale,
            Err(error) => return Err(error.into()),
        };

        match commit {
            RescanCommit::Committed(identity) => {
                // cache は commit 済みなので clear failure でも resync event を先に届ける。
                let cleared = resources.write_ignore().clear();
                emit_compat_envelope(
                    ctx,
                    &identity,
                    EVENT_RESYNC_REQUIRED,
                    ResyncRequiredPayload {
                        reason: ResyncReason::Rescan,
                    },
                    before_sequence,
                )?;
                cleared?;
                return Ok(());
            }
            RescanCommit::Stale => return Ok(()),
            RescanCommit::Retry if attempt < RESCAN_MAX_ATTEMPTS => {
                attempt += 1;
            }
            RescanCommit::Retry => {
                log::warn!("watcher_event: full rescan gave up after {attempt} attempts");
                let Some(current) = fresh_adapter_snapshot(ctx)? else {
                    return Ok(());
                };
                let Some(_resources) = resources_for_snapshot(ctx, &current)? else {
                    return Ok(());
                };
                return emit_diagnostic(
                    ctx,
                    &current.identity(),
                    DiagnosticCode::RescanFailed,
                    "再スキャン中に状態が変化し続けたため復旧できませんでした",
                    Vec::new(),
                    before_sequence,
                );
            }
        }
    }
}

/// backend 障害を identity-guarded diagnostic として FE へ通知する。
fn handle_backend_failure(
    failure: &WatcherFailure,
    ctx: &AdapterContext,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    let Some(snapshot) = fresh_adapter_snapshot(ctx)? else {
        return Ok(());
    };
    let Some(_resources) = resources_for_snapshot(ctx, &snapshot)? else {
        return Ok(());
    };
    log::warn!(
        "watcher_event: backend error ({:?}): {}",
        failure.kind,
        failure.detail
    );
    let paths = failure
        .paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    emit_diagnostic(
        ctx,
        &snapshot.identity(),
        diagnostic_code_for(failure.kind),
        &failure.detail,
        paths,
        before_sequence,
    )
}

fn diagnostic_code_for(kind: WatcherFailureKind) -> DiagnosticCode {
    match kind {
        WatcherFailureKind::WatchPathUnavailable => DiagnosticCode::WatchPathUnavailable,
        WatcherFailureKind::ResourceExhausted => DiagnosticCode::ResourceExhausted,
        WatcherFailureKind::PermissionDenied => DiagnosticCode::PermissionDenied,
        WatcherFailureKind::Io => DiagnosticCode::Io,
        WatcherFailureKind::Unknown => DiagnosticCode::Unknown,
    }
}

fn emit_diagnostic(
    ctx: &AdapterContext,
    identity: &SessionIdentity,
    code: DiagnosticCode,
    message: &str,
    paths: Vec<String>,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    emit_compat_envelope(
        ctx,
        identity,
        EVENT_DIAGNOSTIC,
        DiagnosticPayload {
            code,
            message: message.to_string(),
            paths,
        },
        before_sequence,
    )
}

/// committed identity を既存 numeric wire shape へ変換し、current の場合だけ emit する。
///
/// eventSeq の identity 検証と採番は同じ domain critical section で行われる。
/// 採番後に emit が失敗しても番号は戻さず、FE の gap recovery に委ねる。
fn emit_compat_envelope<P: EnvelopePayload + serde::Serialize>(
    ctx: &AdapterContext,
    identity: &SessionIdentity,
    event_name: &str,
    payload: P,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    before_sequence();
    let Some(event_seq) = ctx.state.next_event_seq_if_current(identity)? else {
        return Ok(());
    };
    let version = identity.version();
    let project_key = ProjectKey::from_root(identity.project_root().as_path());
    let generation = ProjectGeneration::from_raw(version.session_id.as_u64());
    let revision = TasksRevision::from_raw(version.revision.as_u64());
    let envelope = build_envelope(&project_key, generation, revision, event_seq, payload);
    match serde_json::to_value(&envelope) {
        Ok(value) => (ctx.emit)(event_name, value),
        Err(err) => {
            log::warn!("watcher_event: failed to serialize `{event_name}` envelope: {err}");
        }
    }
    Ok(())
}

/// `handle_event` 内で発生し得る typed error。
#[derive(Debug, thiserror::Error)]
pub(crate) enum HandleError {
    #[error("AppState lock poisoned: {0}")]
    StateLock(#[from] AppStateError),
    #[error(transparent)]
    SessionWrite(#[from] SessionWriteError),
    #[error("WriteIgnore lock poisoned: {0}")]
    WriteIgnore(#[from] spec_board_fs::watcher::write_ignore::WriteIgnoreError),
}

#[cfg(test)]
#[path = "handler_tests.rs"]
mod handler_tests;
