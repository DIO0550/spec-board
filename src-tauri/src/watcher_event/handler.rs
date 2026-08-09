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

use crate::config::{load_persisted, write_guide_markdown_best_effort, Config};
use crate::project::load_warning::{deduplicate_and_sort, ProjectLoadWarningStage};
use crate::project::open::{persist_config, status_inputs_from_tasks};
use crate::project_session::{ProjectSessionSnapshot, SessionIdentity};
use crate::state::{AppStateError, ResourceAccessError, SessionResourceAccess, SessionWriteError};
use crate::task::parse::{
    default_status_for, normalized_task_file_path, task_from_markdown, TaskParseContext,
};
use crate::task::rebuild::rebuild_tasks_from_disk_with_report;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::warning::has_parent_cycle_warning;
use spec_board_fs::task::file_scanner::task_md_relative_path;
use spec_board_fs::watcher::core::{FsEvent, WatcherFailure, WatcherFailureKind};

use super::envelope::{
    DiagnosticCode, DiagnosticPayload, EnvelopePayload, ResyncReason, ResyncRequiredPayload,
    TaskDeletedPayload, TaskUpsertPayload, EVENT_DIAGNOSTIC, EVENT_RESYNC_REQUIRED,
    EVENT_TASK_CREATED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED,
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

    // 未知 status なら config へカラムを足してから commit する。保存できたときだけ
    // 採用するのは open と同じ方針（保存に失敗したまま resident config だけ進めると、
    // 次の resync が disk の config を読み直して静かに巻き戻る）。
    //
    // ここで書く config.json を write_ignore へ登録してはならない。本関数冒頭の
    // path フィルタが `.spec-board/` 配下を `unregister` より前に落とすため、
    // 登録しても対応する event が消費されず、永久に残る marker になる。
    let outcome = reconcile_config_for_event(
        ctx,
        &snapshot,
        &[(
            rel_path.as_path_buf(),
            Some(task.status.as_str().to_owned()),
        )],
    );
    // `EventConfigOutcome` は `Config` を含むので `Copy` ではない。`matches!` を
    // 先に書くと outcome が消費されて `into_config()` が use-after-move になるため、
    // 先に取り出してから差し替えの有無を判定する。
    let next_config = outcome.into_config();
    let config_replaced = next_config.is_some();

    let expected = snapshot.identity();
    let committed = match ctx.state.commit_session_write(&expected, move |session| {
        if let Some(config) = next_config {
            session.replace_config(config);
        }
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

    // config を差し替えたときは task 単体の envelope を出さず、resync だけを出す。
    // 新カラムを知らない FE に task-created を先に渡しても、その task はどの列にも
    // 入れず一瞬消えたように見えるため、全量再取得へ一本化する。
    if config_replaced {
        return emit_compat_envelope(
            ctx,
            &committed_identity,
            EVENT_RESYNC_REQUIRED,
            ResyncRequiredPayload {
                reason: ResyncReason::Rescan,
            },
            before_sequence,
        );
    }

    emit_compat_envelope(
        ctx,
        &committed_identity,
        event_name,
        TaskUpsertPayload { task: emitted_task },
        before_sequence,
    )
}

/// watcher event 起点で config をどう扱うかの結論。
///
/// 「config.json を書いたか」と「resident config を差し替えるべきか」は別物なので、
/// `Option<Config>` ではなく列挙で持つ。disk に既に新しいカラムがある場合は
/// 書き込み不要だが resident は追いつかせる必要がある。
enum EventConfigOutcome {
    /// resident config を触る必要が無い。呼び出し側は task 単体の envelope を出す。
    Unchanged,
    /// `config.json` は既に必要なカラムを持っていた。書き込みはせず、読み直した
    /// 内容へ resident を揃える。
    AdoptPersisted(Config),
    /// カラムを追加して `config.json` を保存した。resident も同じ内容へ揃える。
    Saved(Config),
}

impl EventConfigOutcome {
    /// resident へ載せる `Config`（差し替え不要なら `None`）。
    fn into_config(self) -> Option<Config> {
        match self {
            Self::Unchanged => None,
            Self::AdoptPersisted(config) | Self::Saved(config) => Some(config),
        }
    }
}

/// watcher event で観測した status に足りないカラムがあれば、`config.json` を
/// 読み直したうえでカラムを足して保存する。
///
/// # 判定の順序
/// 1. resident config（`snapshot.config()`）に対して plan を立て、no-op なら
///    ここで終わる。既知 status の更新で disk を読まないための足切り。
/// 2. 追加が要るときだけ `load_persisted` で `config.json` を読み直し、
///    **その内容に対して plan を立て直して**保存する。resident を基準に書くと、
///    open 以降に外部エディタが加えた変更を黙って上書きしてしまうため。
/// 3. 読み直しが `Ok(None)`（削除された）/ `Err(_)`（壊れている）なら何もしない。
///    open 側と同じく、既存ファイルを勝手に作り直さない・上書きしない。
/// 4. 読み直した config が既に必要なカラムを持っていたら（外部が先に足していた）、
///    書き込みはせず `AdoptPersisted` を返す。ここで `Unchanged` にすると、
///    resident に無いカラムのタスクが画面に出ないまま取り残される。
/// 5. 保存に失敗した場合も、読み直した config が resident と違えば
///    `AdoptPersisted` を返す。disk の内容は常に真値なので、resident をそこへ
///    揃えるのは reconcile の成否とは独立に安全（「保存成功時のみ採用」は
///    reconcile が**足したカラム**の話であって、読み取った内容の採否ではない）。
///
/// この disk 読み直しがあるため、config の由来フラグを session へ持ち込む必要は
/// 無い。フラグは open 時点のスナップショットでしかなく、open 後に config.json が
/// 削除された / 壊された場合を検知できないが、書く直前の読み直しはその両方を
/// 捕まえられる。フラグを併置すると真値が 2 つになるだけで得が無い。
///
/// 保存に失敗しても event 全体は失敗させない。監視中のファイル更新を落とすより、
/// タスクだけでも取り込んで次回 open の reconcile に委ねるほうが実害が小さいため。
/// この経路には `loadWarnings` に相当する通知先が無く、log にのみ残す。
///
/// なお本 helper は「保存 → commit」の順で呼ばれるため、後続の commit が競合すると
/// config.json だけが先行する窓が生じる。順序を逆転させると、保存に失敗したときに
/// resident だけ新カラムを持つことになり「保存成功時のみ採用」と衝突する。
/// 同一 session のまま競合した場合、この乖離を解消する自動トリガーは無く、
/// 「resident が知らない status を含む次の event」または「次の open」まで残る。
fn reconcile_config_for_event(
    ctx: &AdapterContext,
    snapshot: &ProjectSessionSnapshot,
    inputs: &[(PathBuf, Option<String>)],
) -> EventConfigOutcome {
    if snapshot.config().plan_reconcile_columns(inputs).is_noop {
        return EventConfigOutcome::Unchanged;
    }

    let root = ctx.project_root.as_path();
    let persisted = match load_persisted(root) {
        Ok(Some(config)) => config,
        Ok(None) => {
            log::warn!("watcher_event: config.json is missing; skipping column reconcile");
            return EventConfigOutcome::Unchanged;
        }
        Err(error) => {
            log::warn!(
                "watcher_event: config.json is unreadable; skipping column reconcile: {error}"
            );
            return EventConfigOutcome::Unchanged;
        }
    };

    let plan = persisted.plan_reconcile_columns(inputs);
    if plan.is_noop {
        return adopt_if_stale(snapshot, persisted);
    }

    // 書き出しは open 側と同じ `persist_config` を使う。ここで serialize と
    // write_atomic を書き下ろすと「pretty serialize → atomic write」の 4 箇所目に
    // なるため、`pub(crate)` にしたものを再利用する。
    if let Err(error) = persist_config(root, &plan.new_config, ctx.config_writer.as_ref()) {
        log::warn!("watcher_event: failed to persist reconciled config: {error}");
        return adopt_if_stale(snapshot, persisted);
    }
    // GUIDE.md を書く条件は全経路で「config.json を実際に保存したとき」に統一する。
    // 保存していない `AdoptPersisted` では書かない（その内容を書いた writer が
    // GUIDE の更新責務を持つ）。session commit の後ろへ回すと、commit が競合して
    // retry へ抜けたときに GUIDE だけ永久に古いまま残る。
    write_guide_markdown_best_effort(root, &plan.new_config);
    EventConfigOutcome::Saved(plan.new_config)
}

/// 読み直した config が resident と違えば差し替えを促す。
fn adopt_if_stale(snapshot: &ProjectSessionSnapshot, persisted: Config) -> EventConfigOutcome {
    if snapshot.config() == &persisted {
        return EventConfigOutcome::Unchanged;
    }
    EventConfigOutcome::AdoptPersisted(persisted)
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
        let report = match rebuild_tasks_from_disk_with_report(
            ctx.project_root.as_path(),
            &default_status,
            ctx.io.as_ref(),
        ) {
            Ok(report) => report,
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
        let mut load_warnings = snapshot
            .load_warnings()
            .iter()
            .filter(|warning| warning.stage == ProjectLoadWarningStage::Config)
            .cloned()
            .collect::<Vec<_>>();
        load_warnings.extend(report.warnings);
        let load_warnings = deduplicate_and_sort(load_warnings);
        let cache: HashMap<PathBuf, Task> = report
            .tasks
            .into_iter()
            .map(|task| (PathBuf::from(task.file_path.as_str()), task))
            .collect();
        // cache は open 側と同じ `HashMap<PathBuf, Task>` なので、詰め替えは
        // `status_inputs_from_tasks` をそのまま使う（同型の helper を watcher 側に
        // 作らない）。
        //
        // reconcile は毎周とも「その周の最新 snapshot と最新 cache」に対して計算し
        // 直す。1 周目の結果を持ち回すと、retry 中に現れた新しい status を取りこぼし
        // たり、その間に別 writer が足したカラムを古い Config で上書きしたりする。
        // 二重書き込みの抑止と resident の追従は、どちらも helper 内部の読み直しから
        // 自然に出るので、周をまたぐ状態は持たない。
        let outcome = reconcile_config_for_event(ctx, &snapshot, &status_inputs_from_tasks(&cache));
        let next_config = outcome.into_config();
        let expected = snapshot.identity();
        let commit = match ctx.state.commit_session_write(&expected, move |session| {
            if let Some(config) = next_config {
                session.replace_config(config);
            }
            session.replace_tasks_and_load_warnings(cache, load_warnings);
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
/// 本体は `watcher_event::emit_envelope_if_current` に置く。adapter 経路と背景
/// resync 経路で identity ガードの挙動が乖離しないよう、実装は 1 つに保つ。
/// adapter 固有の `before_sequence` テストシームだけをここに残している。
fn emit_compat_envelope<P: EnvelopePayload + serde::Serialize>(
    ctx: &AdapterContext,
    identity: &SessionIdentity,
    event_name: &str,
    payload: P,
    before_sequence: &mut dyn FnMut(),
) -> Result<(), HandleError> {
    before_sequence();
    super::emit_envelope_if_current(
        ctx.state.as_ref(),
        ctx.emit.as_ref(),
        identity,
        event_name,
        payload,
    )?;
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
