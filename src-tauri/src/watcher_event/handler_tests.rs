//! `handle_change` の identity guard と envelope 化に対する単体テスト。
//!
//! 差分更新そのものの挙動は `watcher_event/tests.rs` が担当し、ここでは
//! 「どの session の event として emit されるか」「連番がどう進むか」を固定する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tempfile::TempDir;

use super::{
    changes_in_order, handle_batch, handle_change, handle_change_with_before_sequence, HandleError,
    TaskFileChange,
};
use crate::config::{ConfigWriter, FsConfigWriter};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{PreparedProjectSession, SessionId, SessionIdentity};
use crate::state::active_project_resources::{
    pending_activation_state, StagedProjectResources, WatcherActivation,
};
use crate::state::{AppState, BoxedWatcherHandle, SessionResourceAccess};
use crate::task::io::{FsTaskIo, TaskIo};
use crate::watcher_event::watcher_test_support::{rename_batch, upserts_batch};
use crate::watcher_event::{AdapterContext, EmitFn};
use spec_board_fs::watcher::core::{WatcherFailure, WatcherFailureKind};
use spec_board_fs::watcher::file_change_batch::FileChangeBatch;
use spec_board_fs::watcher::handle::NoopWatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;
use std::thread;

type EmitLog = Arc<Mutex<Vec<(String, Value)>>>;

fn task_md(title: &str) -> String {
    format!("---\ntitle: {title}\nstatus: Todo\n---\n\nbody\n")
}

fn write_md(root: &Path, rel: &str, body: &str) -> PathBuf {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(&absolute, body).expect("write md");
    absolute
}

/// `open_project` 相当の commit を行い、現行世代の adapter context を作る。
fn install_active_session(state: &AppState, root: &Path) -> SessionIdentity {
    let session_id = state.reserve_session_id().expect("reserve session ID");
    let candidate = PreparedProjectSession::new(
        ProjectRoot::from_path_buf(root.to_path_buf()).expect("valid project root"),
        Default::default(),
        Default::default(),
        Default::default(),
        crate::task::task_index::ResolvedTaskSet::default(),
    )
    .into_session(session_id);
    let identity = candidate.identity();
    let staged = StagedProjectResources::new(
        identity.clone(),
        Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
        WatcherActivation::new(pending_activation_state(), thread::current()),
        Arc::new(WriteIgnoreRegistry::new()),
    );
    state
        .swap_open(candidate, staged)
        .expect("install active test session");
    identity
}

fn active_resources(state: &AppState) -> SessionResourceAccess {
    let snapshot = state.require_session_snapshot().expect("active session");
    state
        .resources_for(snapshot.version())
        .expect("matching active resources")
}

fn session_revision(state: &AppState) -> u64 {
    state
        .require_session_snapshot()
        .expect("active session")
        .version()
        .revision
        .as_u64()
}

fn commit_config(state: &AppState, config: crate::config::Config) {
    let snapshot = state.require_session_snapshot().expect("active session");
    state
        .commit_session_write(&snapshot.identity(), move |session| {
            session.replace_config(config);
        })
        .expect("commit config");
}

fn bump_session_revision(state: &AppState) {
    let snapshot = state.require_session_snapshot().expect("active session");
    state
        .commit_session_write(&snapshot.identity(), |_| ())
        .expect("bump revision");
}

fn build_installed_ctx(root: &Path) -> (Arc<crate::state::AppState>, AdapterContext, EmitLog) {
    build_installed_ctx_with_config_writer(
        root,
        Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    )
}

/// config の書き込みだけ差し替えた ctx を作る。書き込み回数の計数と失敗注入に使う。
fn build_installed_ctx_with_config_writer(
    root: &Path,
    config_writer: Arc<dyn ConfigWriter + Send + Sync>,
) -> (Arc<crate::state::AppState>, AdapterContext, EmitLog) {
    let state = Arc::new(crate::state::AppState::new());
    let identity = install_active_session(&state, root);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |event, payload| {
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer,
    };
    (state, ctx, log)
}

fn drain(log: &EmitLog) -> Vec<(String, Value)> {
    log.lock().expect("emit log").drain(..).collect()
}

#[test]
fn upsert_emits_an_envelope_carrying_the_session_identity() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
    let envelope = &entries[0].1;
    assert_eq!(
        dir.path().to_string_lossy().as_ref(),
        envelope["projectKey"].as_str().expect("projectKey")
    );
    assert_eq!(1, envelope["generation"]);
    assert_eq!(true, envelope["cacheMutating"]);
    assert_eq!("1-1", envelope["changeId"]);
    assert_eq!("tasks/a.md", envelope["payload"]["task"]["filePath"]);
}

#[test]
fn events_from_a_stale_generation_touch_neither_the_cache_nor_the_emitter() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    // 旧 watcher が生き残ったまま新しい project が commit された状況を再現する。
    ctx.session_id = SessionId::from_raw(ctx.session_id.as_u64() - 1);
    let revision_before = session_revision(&state);

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert!(drain(&log).is_empty(), "旧世代は一切 emit してはならない");
    assert!(state.test_tasks_snapshot().expect("readable").is_empty());
    assert_eq!(revision_before, session_revision(&state));
}

#[test]
fn same_path_reopen_makes_the_old_adapter_a_complete_no_op() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    install_active_session(&state, dir.path());
    let current_resources = active_resources(&state);
    current_resources
        .write_ignore()
        .register(&abs)
        .expect("register current marker");
    let revision_before = session_revision(&state);
    let snapshot_before = state.require_session_snapshot().expect("current session");
    let event_seq_before = state
        .watcher_session_for_snapshot(&snapshot_before)
        .event_seq
        .as_u64();

    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("stale event is ignored");

    let snapshot_after = state.require_session_snapshot().expect("current session");
    let event_seq_after = state
        .watcher_session_for_snapshot(&snapshot_after)
        .event_seq
        .as_u64();
    assert!(drain(&log).is_empty());
    assert_eq!(revision_before, session_revision(&state));
    assert_eq!(event_seq_before, event_seq_after);
    assert!(
        current_resources
            .write_ignore()
            .unregister(&abs)
            .expect("current marker remains"),
        "stale adapter must not consume the reopened session marker"
    );
}

#[test]
fn switch_after_commit_before_sequence_consumes_no_event_seq_and_emits_nothing() {
    let project_a = TempDir::new().expect("project A");
    let project_b = TempDir::new().expect("project B");
    let (state, ctx, log) = build_installed_ctx(project_a.path());
    let abs = write_md(project_a.path(), "tasks/a.md", &task_md("A"));
    let state_for_hook = Arc::clone(&state);
    let project_b_root = project_b.path().to_path_buf();
    let baseline = Arc::new(Mutex::new(None));
    let baseline_for_hook = Arc::clone(&baseline);
    let mut switched = false;

    handle_change_with_before_sequence(&TaskFileChange::Upserted(abs), &ctx, move || {
        assert!(!switched, "single upsert emits at most once");
        switched = true;
        install_active_session(&state_for_hook, &project_b_root);
        let snapshot = state_for_hook
            .require_session_snapshot()
            .expect("project B active");
        let event_seq = state_for_hook
            .watcher_session_for_snapshot(&snapshot)
            .event_seq
            .as_u64();
        *baseline_for_hook.lock().expect("baseline") = Some(event_seq);
    })
    .expect("stale post-commit emit is suppressed");

    assert!(drain(&log).is_empty());
    assert_eq!(Some(0), *baseline.lock().expect("baseline"));
    let current = state.require_session_snapshot().expect("project B active");
    assert_eq!(project_b.path(), current.project_root().as_path());
    assert!(current.tasks().is_empty());
    assert_eq!(
        0,
        state
            .watcher_session_for_snapshot(&current)
            .event_seq
            .as_u64(),
        "project B baseline must not contain a false eventSeq gap"
    );
}
#[test]
fn watcher_mutation_acquires_the_exact_root_writer_gate_before_touching_state() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let root = crate::project::project_root::ProjectRoot::from_path_buf(dir.path().to_path_buf())
        .expect("valid project root");
    state.poison_writer_gate_for_test(&root);
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));

    let error = handle_change(&TaskFileChange::Upserted(abs), &ctx)
        .expect_err("poisoned writer gate must stop the watcher mutation");

    assert!(matches!(
        error,
        HandleError::StateLock(crate::state::AppStateError::WriterGatePoisoned)
    ));
    assert!(drain(&log).is_empty());
    assert!(state.test_tasks_snapshot().expect("readable").is_empty());
}

#[test]
fn consecutive_upserts_advance_both_revision_and_event_seq() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let first = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let second = write_md(dir.path(), "tasks/b.md", &task_md("B"));

    handle_change(&TaskFileChange::Upserted(first), &ctx).expect("handler ok");
    handle_change(&TaskFileChange::Upserted(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries[0].1["eventSeq"]);
    assert_eq!(2, entries[1].1["eventSeq"]);
    assert!(
        entries[0].1["revision"].as_u64() < entries[1].1["revision"].as_u64(),
        "revision も単調増加する"
    );
}

#[test]
fn event_seq_is_consumed_even_when_the_emitter_drops_the_event() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    let identity = install_active_session(&state, dir.path());
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let dropped = Arc::new(Mutex::new(false));
    let dropped_clone = Arc::clone(&dropped);
    // AppHandle::emit の失敗を模す。EmitFn は成否を返さないため、
    // 「呼ばれたが配信されなかった」を無記録で表現する。
    let emit: EmitFn = Box::new(move |event, payload| {
        let mut first = dropped_clone.lock().expect("flag");
        if !*first {
            *first = true;
            return;
        }
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    let first = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let second = write_md(dir.path(), "tasks/b.md", &task_md("B"));

    handle_change(&TaskFileChange::Upserted(first), &ctx).expect("handler ok");
    handle_change(&TaskFileChange::Upserted(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!(
        2, entries[0].1["eventSeq"],
        "emit が失敗しても連番は戻さない（欠番 → FE の gap 検知 → 自動再取得）"
    );
}

#[test]
fn delete_emits_an_envelope_with_the_relative_file_path_only() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed");
    drain(&log);
    std::fs::remove_file(&abs).expect("remove md");

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!(true, entries[0].1["cacheMutating"]);
    assert_eq!("tasks/a.md", entries[0].1["payload"]["filePath"]);
    assert!(entries[0].1["payload"].get("task").is_none());
}

// ───────── TaskFileChange::Rescan（full reconciliation） ─────────

/// `read` のたびに `tasks_cache` を触って revision を進める `TaskIo`。
///
/// 「走査中に mutation command が commit した」状況を、スレッドを使わずに
/// 決定的に再現するためのテストダブル。
struct RevisionBumpingIo {
    inner: FsTaskIo,
    state: Arc<crate::state::AppState>,
    /// 残り何回 bump するか。0 になったら以後は素通しする。
    remaining_bumps: Mutex<u32>,
    reads: Mutex<u32>,
}

impl RevisionBumpingIo {
    fn new(state: Arc<crate::state::AppState>, bumps: u32) -> Self {
        Self {
            inner: FsTaskIo,
            state,
            remaining_bumps: Mutex::new(bumps),
            reads: Mutex::new(0),
        }
    }

    fn read_count(&self) -> u32 {
        *self.reads.lock().expect("reads")
    }
}

impl TaskIo for RevisionBumpingIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        *self.reads.lock().expect("reads") += 1;
        let mut remaining = self.remaining_bumps.lock().expect("bumps");
        if *remaining > 0 {
            *remaining -= 1;
            bump_session_revision(&self.state);
        }
        self.inner.read(path)
    }

    fn try_exists(&self, path: &Path) -> Result<bool, crate::task::io::TaskIoError> {
        self.inner.try_exists(path)
    }
}

fn ctx_with_io(
    _root: &Path,
    state: &Arc<crate::state::AppState>,
    io: Arc<dyn TaskIo>,
) -> (AdapterContext, EmitLog) {
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |event, payload| {
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let identity = state
        .active_session_identity()
        .expect("active session identity");
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state: Arc::clone(state),
        emit,
        io,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    (ctx, log)
}

#[test]
fn rescan_fills_an_empty_cache_from_disk_and_requests_a_single_resync() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    for name in ["a", "b", "c"] {
        write_md(dir.path(), &format!("tasks/{name}.md"), &task_md(name));
    }

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let mut paths: Vec<String> = state
        .test_tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|task| task.file_path().as_str().to_owned())
        .collect();
    paths.sort();
    assert_eq!(
        vec![
            "tasks/a.md".to_string(),
            "tasks/b.md".to_string(),
            "tasks/c.md".to_string()
        ],
        paths
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
}

#[test]
fn rescan_converges_a_diverged_cache_onto_the_disk_contents() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let stale = write_md(dir.path(), "tasks/stale.md", &task_md("Stale"));
    handle_change(&TaskFileChange::Upserted(stale.clone()), &ctx).expect("seed stale");
    std::fs::remove_file(&stale).expect("remove stale from disk");
    write_md(dir.path(), "tasks/fresh.md", &task_md("Fresh"));
    drain(&log);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let paths: Vec<String> = state
        .test_tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|task| task.file_path().as_str().to_owned())
        .collect();
    assert_eq!(vec!["tasks/fresh.md".to_string()], paths);
}

#[test]
fn resync_request_carries_only_a_reason_and_never_a_snapshot() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let entries = drain(&log);
    assert_eq!(
        serde_json::json!({ "reason": "rescan" }),
        entries[0].1["payload"],
        "全 task を載せると 1 event が数 MB になる"
    );
}

#[test]
fn rescan_envelope_reports_the_bumped_revision_as_cache_mutating() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let before = session_revision(&state);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let entries = drain(&log);
    assert_eq!(before + 1, session_revision(&state));
    assert_eq!(session_revision(&state), entries[0].1["revision"]);
    assert_eq!(true, entries[0].1["cacheMutating"]);
}

#[test]
fn rescan_retries_the_scan_when_the_revision_moved_while_scanning() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    install_active_session(&state, dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let io = Arc::new(RevisionBumpingIo::new(Arc::clone(&state), 1));
    let (ctx, log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    assert_eq!(
        2,
        io.read_count(),
        "1 回目は CAS 不一致で捨て、走査からやり直す"
    );
    assert_eq!(1, state.test_tasks_snapshot().expect("readable").len());
    assert_eq!(1, drain(&log).len());
}

#[test]
fn rescan_gives_up_without_committing_when_the_state_keeps_moving() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    install_active_session(&state, dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    // 毎回 revision が進み続けるので CAS は一度も成功しない。
    let io = Arc::new(RevisionBumpingIo::new(Arc::clone(&state), u32::MAX));
    let (ctx, log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    assert_eq!(3, io.read_count(), "上限 3 回で打ち切る");
    assert!(
        state.test_tasks_snapshot().expect("readable").is_empty(),
        "最終試行を無条件で採用すると、その走査中の config 変更まで確定させてしまう"
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-diagnostic", entries[0].0);
    assert_eq!("rescanFailed", entries[0].1["payload"]["code"]);
}

#[test]
fn rescan_clears_the_write_ignore_registry() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    active_resources(&state)
        .write_ignore()
        .register(dir.path().join("tasks/self-written.md"))
        .expect("register");

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    assert!(
        active_resources(&state)
            .write_ignore()
            .is_empty()
            .expect("readable"),
        "stale entry が残ると以後の自前 write 判定を誤らせる"
    );
}

#[test]
fn rescan_on_an_empty_project_empties_the_cache_and_still_requests_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed");
    std::fs::remove_file(&abs).expect("remove md");
    drain(&log);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    assert!(state.test_tasks_snapshot().expect("readable").is_empty());
    assert_eq!(1, drain(&log).len());
}

#[test]
fn rescan_handles_the_already_empty_and_single_file_boundaries() {
    let empty_dir = TempDir::new().expect("tempdir");
    let (empty_state, empty_ctx, empty_log) = build_installed_ctx(empty_dir.path());

    handle_change(&TaskFileChange::Rescan, &empty_ctx).expect("rescan ok");

    assert!(empty_state
        .test_tasks_snapshot()
        .expect("readable")
        .is_empty());
    assert_eq!(1, drain(&empty_log).len());

    let single_dir = TempDir::new().expect("tempdir");
    let (single_state, single_ctx, single_log) = build_installed_ctx(single_dir.path());
    write_md(single_dir.path(), "tasks/only.md", &task_md("Only"));

    handle_change(&TaskFileChange::Rescan, &single_ctx).expect("rescan ok");

    assert_eq!(
        1,
        single_state.test_tasks_snapshot().expect("readable").len()
    );
    assert_eq!(1, drain(&single_log).len());
}

#[test]
fn rescan_failure_keeps_the_cache_and_reports_a_diagnostic_only() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("seed");
    drain(&log);
    let revision_before = session_revision(&state);
    std::fs::remove_dir_all(dir.path()).expect("remove project root");

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan reports instead of failing");

    assert_eq!(1, state.test_tasks_snapshot().expect("readable").len());
    assert_eq!(revision_before, session_revision(&state));
    let entries = drain(&log);
    assert_eq!("watcher-diagnostic", entries[0].0);
    assert_eq!("rescanFailed", entries[0].1["payload"]["code"]);
    assert_eq!(false, entries[0].1["cacheMutating"]);
}

#[test]
fn rescan_surfaces_a_poisoned_tasks_cache_as_a_handle_error() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let poison_state = Arc::clone(&state);
    let expected = state
        .require_session_snapshot()
        .expect("active session")
        .identity();
    let _ = std::thread::spawn(move || {
        poison_state
            .commit_session_write(&expected, |_| panic!("poison project domain"))
            .ok();
    })
    .join();

    let error = handle_change(&TaskFileChange::Rescan, &ctx).expect_err("poisoned lock surfaces");

    assert!(matches!(error, HandleError::StateLock(_)));
}

#[test]
fn a_late_modify_after_a_rescan_still_lands_with_a_higher_revision() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");
    let rescan_revision = session_revision(&state);
    drain(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("modify ok");

    let tasks = state.test_tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!("A2", tasks[0].title());
    assert!(rescan_revision < session_revision(&state));
    let entries = drain(&log);
    assert!(
        rescan_revision < entries[0].1["revision"].as_u64().expect("revision"),
        "Rescan を追い越した event ではないことが revision で判る"
    );
}

// ───────── TaskFileChange::Failure（structured diagnostics） ─────────

fn failure(kind: WatcherFailureKind, detail: &str, paths: Vec<PathBuf>) -> WatcherFailure {
    WatcherFailure {
        kind,
        paths,
        detail: detail.to_string(),
    }
}

#[test]
fn backend_failure_is_reported_as_a_watcher_diagnostic() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());

    handle_change(
        &TaskFileChange::Failure(failure(
            WatcherFailureKind::ResourceExhausted,
            "inotify watch limit reached",
            vec![dir.path().join("tasks")],
        )),
        &ctx,
    )
    .expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-diagnostic", entries[0].0);
    let payload = &entries[0].1["payload"];
    assert_eq!("resourceExhausted", payload["code"]);
    assert_eq!("inotify watch limit reached", payload["message"]);
    assert_eq!(
        serde_json::json!([dir.path().join("tasks").to_string_lossy()]),
        payload["paths"]
    );
}

#[test]
fn a_diagnostic_leaves_the_cache_and_revision_untouched() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("seed");
    drain(&log);
    let revision_before = session_revision(&state);

    handle_change(
        &TaskFileChange::Failure(failure(WatcherFailureKind::Io, "read error", Vec::new())),
        &ctx,
    )
    .expect("handler ok");

    let entries = drain(&log);
    assert_eq!(
        false, entries[0].1["cacheMutating"],
        "true にすると FE が revision の単調性を要求して通知が 1 度も届かない"
    );
    assert_eq!(revision_before, session_revision(&state));
    assert_eq!(1, state.test_tasks_snapshot().expect("readable").len());
}

#[test]
fn every_watcher_failure_kind_maps_to_a_diagnostic_code() {
    let cases = [
        (
            WatcherFailureKind::WatchPathUnavailable,
            "watchPathUnavailable",
        ),
        (WatcherFailureKind::ResourceExhausted, "resourceExhausted"),
        (WatcherFailureKind::PermissionDenied, "permissionDenied"),
        (WatcherFailureKind::Io, "io"),
        (WatcherFailureKind::Unknown, "unknown"),
    ];

    for (kind, expected) in cases {
        let dir = TempDir::new().expect("tempdir");
        let (_state, ctx, log) = build_installed_ctx(dir.path());

        handle_change(
            &TaskFileChange::Failure(failure(kind, "detail", Vec::new())),
            &ctx,
        )
        .expect("handler ok");

        let entries = drain(&log);
        assert_eq!(
            serde_json::Value::from(expected),
            entries[0].1["payload"]["code"],
            "{kind:?} の写像が期待と異なる"
        );
    }
}

#[test]
fn rescan_resolves_the_default_status_from_the_current_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    // spawn 時点の既定は "Todo"。カラム更新で先頭が "Backlog" に変わった状況を作る。
    commit_config(
        &state,
        crate::config::Config::new(
            vec![crate::config::Column {
                name: "Backlog".into(),
                order: 0,
                color: None,
                wip_limit: None,
            }],
            Default::default(),
            None,
        ),
    );
    write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let tasks = state.test_tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!(
        "Backlog",
        tasks[0].status().as_str(),
        "spawn 時に焼き込んだ既定 status を使うと reopen 時と結果が食い違う"
    );
}

#[test]
fn rescan_still_requests_a_resync_when_clearing_write_ignore_fails() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    active_resources(&state)
        .write_ignore()
        .poison_lock_for_testing();

    let error = handle_change(&TaskFileChange::Rescan, &ctx).expect_err("clear failure surfaces");

    let entries = drain(&log);
    assert_eq!(
        1,
        entries.len(),
        "cache は置換済みなので再取得要求は必ず届ける"
    );
    assert_eq!("watcher-resync-required", entries[0].0);
    assert!(matches!(error, HandleError::WriteIgnore(_)));
    assert_eq!(1, state.test_tasks_snapshot().expect("readable").len());
}

#[test]
fn upsert_resolves_the_default_status_from_the_current_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    commit_config(
        &state,
        crate::config::Config::new(
            vec![crate::config::Column {
                name: "Backlog".into(),
                order: 0,
                color: None,
                wip_limit: None,
            }],
            Default::default(),
            None,
        ),
    );
    let abs = write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("modify ok");

    let tasks = state.test_tasks_snapshot().expect("readable");
    assert_eq!(
        "Backlog",
        tasks[0].status().as_str(),
        "rescan で復旧した既定 status が後続の Modified で spawn 時の値に戻ってはならない"
    );
}

#[test]
fn rescan_reresolves_the_default_status_on_every_retry() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    install_active_session(&state, dir.path());
    write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );
    // 1 回目の走査中に config が差し替わり、CAS も不一致になる状況を作る。
    let io = Arc::new(ConfigSwappingIo::new(Arc::clone(&state)));
    let (ctx, _log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_change(&TaskFileChange::Rescan, &ctx).expect("rescan ok");

    let tasks = state.test_tasks_snapshot().expect("readable");
    assert_eq!(
        "Backlog",
        tasks[0].status().as_str(),
        "再走査は各試行で現在の config から既定 status を解決する"
    );
}

/// 最初の `read` で config を差し替えつつ revision も進める `TaskIo`。
struct ConfigSwappingIo {
    inner: FsTaskIo,
    state: Arc<crate::state::AppState>,
    swapped: Mutex<bool>,
}

impl ConfigSwappingIo {
    fn new(state: Arc<crate::state::AppState>) -> Self {
        Self {
            inner: FsTaskIo,
            state,
            swapped: Mutex::new(false),
        }
    }
}

impl TaskIo for ConfigSwappingIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        let mut swapped = self.swapped.lock().expect("swap flag");
        if !*swapped {
            *swapped = true;
            commit_config(
                &self.state,
                crate::config::Config::new(
                    vec![crate::config::Column {
                        name: "Backlog".into(),
                        order: 0,
                        color: None,
                        wip_limit: None,
                    }],
                    Default::default(),
                    None,
                ),
            );
        }
        self.inner.read(path)
    }

    fn try_exists(&self, path: &Path) -> Result<bool, crate::task::io::TaskIoError> {
        self.inner.try_exists(path)
    }
}

// ───────── 未知 status のカラム追加（reconcile） ─────────

use std::sync::atomic::{AtomicU32, Ordering};

/// 常に書き込みへ失敗する `ConfigWriter`。
struct FailingConfigWriter;

impl ConfigWriter for FailingConfigWriter {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "config write denied",
        ))
    }
}

/// 本番と同じ書き込みを行いつつ、呼ばれた回数を数える `ConfigWriter`。
#[derive(Default)]
struct CountingConfigWriter {
    calls: AtomicU32,
}

impl CountingConfigWriter {
    fn calls(&self) -> u32 {
        self.calls.load(Ordering::SeqCst)
    }
}

impl ConfigWriter for CountingConfigWriter {
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        FsConfigWriter.write_atomic(dst, content)
    }
}

/// `read` のたびに同一 session の commit を注入し、CAS 競合を再現する io。
///
/// 注入と同時に「retry の合間に disk が変わる」状況も作れるよう、副作用の
/// クロージャを 1 度だけ走らせる。
struct CommitInjectingTaskIo {
    state: Arc<AppState>,
    remaining: AtomicU32,
    side_effect: Mutex<Option<Box<dyn FnOnce() + Send>>>,
}

impl CommitInjectingTaskIo {
    fn new(state: Arc<AppState>, injections: u32) -> Self {
        Self {
            state,
            remaining: AtomicU32::new(injections),
            side_effect: Mutex::new(None),
        }
    }

    fn with_side_effect(self, side_effect: Box<dyn FnOnce() + Send>) -> Self {
        *self.side_effect.lock().expect("side effect lock") = Some(side_effect);
        self
    }

    fn inject(&self) {
        let consumed =
            self.remaining
                .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |remaining| {
                    remaining.checked_sub(1)
                });
        if consumed.is_err() {
            return;
        }
        if let Some(side_effect) = self.side_effect.lock().expect("side effect lock").take() {
            side_effect();
        }
        let identity = self
            .state
            .active_session_identity()
            .expect("session stays open during injection");
        self.state
            .commit_session_write(&identity, |_| ())
            .expect("injected commit advances the revision");
    }
}

impl TaskIo for CommitInjectingTaskIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        self.inject();
        FsTaskIo.read(path)
    }

    fn try_exists(&self, path: &Path) -> Result<bool, crate::task::io::TaskIoError> {
        FsTaskIo.try_exists(path)
    }
}

fn task_md_with_status(title: &str, status: &str) -> String {
    format!("---\ntitle: {title}\nstatus: {status}\n---\n\nbody\n")
}

fn config_path(root: &Path) -> PathBuf {
    root.join(".spec-board").join("config.json")
}

fn write_config_json(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    std::fs::create_dir_all(&dir).expect("create .spec-board");
    std::fs::write(dir.join("config.json"), content).expect("write config.json");
}

fn read_saved_config(root: &Path) -> crate::config::Config {
    let raw = std::fs::read_to_string(config_path(root)).expect("config.json should exist");
    serde_json::from_str(&raw).expect("saved config.json should parse")
}

fn read_guide(root: &Path) -> Option<String> {
    std::fs::read_to_string(root.join(".spec-board").join("GUIDE.md")).ok()
}

fn write_guide(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    std::fs::create_dir_all(&dir).expect("create .spec-board");
    std::fs::write(dir.join("GUIDE.md"), content).expect("write GUIDE.md");
}

/// `Todo(0)` / `Done(1)` の config を disk と resident session の両方へ置く。
fn seed_base_config(state: &AppState, root: &Path) {
    seed_config_json(
        state,
        root,
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
}

/// 与えた JSON を disk へ書き、同じ内容を resident config としても commit する。
fn seed_config_json(state: &AppState, root: &Path, json: &str) {
    write_config_json(root, json);
    let config: crate::config::Config =
        serde_json::from_str(json).expect("seed config.json should parse");
    commit_config(state, config);
}

fn column_names_of(config: &crate::config::Config) -> Vec<&str> {
    config
        .columns
        .iter()
        .map(|column| column.name.as_str())
        .collect()
}

fn resident_config(state: &AppState) -> crate::config::Config {
    state
        .require_session_snapshot()
        .expect("active session")
        .config()
        .clone()
}

#[test]
fn an_unknown_status_creation_adds_a_column_and_emits_only_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    let revision_before = session_revision(&state);

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert_eq!(1, writer.calls());
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!("rescan", entries[0].1["payload"]["reason"]);
    let resident = resident_config(&state);
    assert_eq!(column_names_of(&resident), vec!["Todo", "Done", "Review"]);
    assert_eq!(
        revision_before + 1,
        session_revision(&state),
        "config と task は同一 revision で差し替わる"
    );
    assert!(state
        .test_tasks_snapshot()
        .expect("readable")
        .iter()
        .any(|task| task.file_path().as_str() == "tasks/a.md"));
}

#[test]
fn a_known_status_creation_keeps_the_task_created_envelope_and_writes_no_config() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md_with_status("A", "Todo"));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
}

#[test]
fn a_repeated_unknown_status_writes_the_config_only_once() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let first = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    let second = write_md(
        dir.path(),
        "tasks/b.md",
        &task_md_with_status("B", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(first), &ctx).expect("handler ok");
    handle_change(&TaskFileChange::Upserted(second), &ctx).expect("handler ok");

    assert_eq!(1, writer.calls());
    let entries = drain(&log);
    assert_eq!(
        vec!["watcher-resync-required", "task-created"],
        entries
            .iter()
            .map(|(name, _)| name.as_str())
            .collect::<Vec<_>>()
    );
}

#[test]
fn modifying_a_task_into_an_unknown_status_suppresses_the_task_updated_envelope() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md_with_status("A", "Todo"));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("handler ok");
    drain(&log);

    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn renaming_into_an_unknown_status_emits_a_delete_then_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let from = write_md(dir.path(), "tasks/a.md", &task_md_with_status("A", "Todo"));
    handle_change(&TaskFileChange::Upserted(from.clone()), &ctx).expect("handler ok");
    drain(&log);
    std::fs::remove_file(&from).expect("remove old path");
    let to = write_md(
        dir.path(),
        "tasks/b.md",
        &task_md_with_status("A", "Review"),
    );

    handle_batch(&rename_batch(from, to), &ctx);

    let entries = drain(&log);
    assert_eq!(
        vec!["task-deleted", "watcher-resync-required"],
        entries
            .iter()
            .map(|(name, _)| name.as_str())
            .collect::<Vec<_>>()
    );
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn deleting_the_last_task_of_a_column_does_not_remove_the_column() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_config_json(
        &state,
        dir.path(),
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Review","order":1}],"cardOrder":{},"doneColumn":"Review"}"#,
    );
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("handler ok");
    drain(&log);
    std::fs::remove_file(&abs).expect("remove md");

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Review"]
    );
}

#[test]
fn a_full_rescan_reconciles_and_still_emits_a_single_resync() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Rescan, &ctx).expect("handler ok");

    assert_eq!(1, writer.calls());
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn a_failed_config_save_keeps_the_task_created_envelope_and_the_old_resident_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::new(FailingConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let before = std::fs::read(config_path(dir.path())).expect("read config");
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx)
        .expect("save failure must not fail the event");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done"]
    );
    assert_eq!(
        before,
        std::fs::read(config_path(dir.path())).expect("read config")
    );
}

#[test]
fn a_failed_config_save_still_adopts_a_newer_config_from_disk() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::new(FailingConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    // 外部エディタが Idea を足した（resident は未取り込み）状態にする。
    write_config_json(
        dir.path(),
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1},{"name":"Idea","order":2}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx)
        .expect("save failure must not fail the event");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!(
        "watcher-resync-required", entries[0].0,
        "disk の内容の採否は reconcile の成否とは独立"
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Idea"]
    );
}

#[test]
fn a_stale_session_event_writes_no_config_and_emits_nothing() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, mut ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    ctx.session_id = SessionId::from_raw(ctx.session_id.as_u64() - 1);

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    assert!(drain(&log).is_empty());
}

#[test]
fn reconcile_does_not_pollute_the_write_ignore_registry() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    drain(&log);
    let resources = active_resources(&state);
    assert!(
        !resources
            .write_ignore()
            .unregister(config_path(dir.path()))
            .expect("registry readable"),
        "config.json を write_ignore へ登録すると、path フィルタで落ちる event が\
         marker を消費できず永久に残る"
    );
    assert!(resources
        .write_ignore()
        .is_empty()
        .expect("registry readable"));
}

#[test]
fn an_empty_status_creates_an_empty_named_column() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md_with_status("A", "\"\""));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", ""]
    );
}

#[test]
fn reconcile_refreshes_the_guide_markdown() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    drain(&log);
    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Review"));
}

#[test]
fn adopting_a_config_from_disk_does_not_rewrite_the_guide_markdown() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    // 外部が先に Review を足した状態。resident はまだ知らない。
    write_config_json(
        dir.path(),
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1},{"name":"Review","order":2}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
    let guide_before = "# ユーザーの GUIDE\n";
    write_guide(dir.path(), guide_before);
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    assert_eq!(read_guide(dir.path()).as_deref(), Some(guide_before));
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!(
        "watcher-resync-required", entries[0].0,
        "書き込みは不要でも resident は disk へ追いつかせる"
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn reconcile_keeps_a_column_that_an_external_editor_added_first() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    write_config_json(
        dir.path(),
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1},{"name":"Idea","order":2}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    drain(&log);
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Idea", "Review"]
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Idea", "Review"]
    );
}

#[test]
fn reconcile_does_not_recreate_or_overwrite_an_unusable_config_file() {
    struct Case {
        label: &'static str,
        replacement: Option<&'static str>,
    }

    let cases = vec![
        Case {
            label: "config.json が削除されている",
            replacement: None,
        },
        Case {
            label: "config.json が壊れている",
            replacement: Some("{ not json"),
        },
    ];

    for case in cases {
        let dir = TempDir::new().expect("tempdir");
        let writer = Arc::new(CountingConfigWriter::default());
        let (state, ctx, log) = build_installed_ctx_with_config_writer(
            dir.path(),
            Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
        );
        seed_base_config(&state, dir.path());
        match case.replacement {
            Some(content) => write_config_json(dir.path(), content),
            None => std::fs::remove_file(config_path(dir.path())).expect("remove config.json"),
        }
        let abs = write_md(
            dir.path(),
            "tasks/a.md",
            &task_md_with_status("A", "Review"),
        );

        handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

        assert_eq!(0, writer.calls(), "case: {}", case.label);
        match case.replacement {
            Some(content) => assert_eq!(
                std::fs::read_to_string(config_path(dir.path())).expect("read config"),
                content,
                "case: {}",
                case.label
            ),
            None => assert!(!config_path(dir.path()).exists(), "case: {}", case.label),
        }
        let entries = drain(&log);
        assert_eq!(1, entries.len(), "case: {}", case.label);
        assert_eq!("task-created", entries[0].0, "case: {}", case.label);
    }
}

#[test]
fn a_known_status_event_does_not_create_a_missing_config_file() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    std::fs::remove_file(config_path(dir.path())).expect("remove config.json");
    let abs = write_md(dir.path(), "tasks/a.md", &task_md_with_status("A", "Todo"));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    assert!(!config_path(dir.path()).exists());
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
}

#[test]
fn a_modification_of_the_config_file_itself_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    let revision_before = session_revision(&state);

    handle_change(&TaskFileChange::Upserted(config_path(dir.path())), &ctx).expect("handler ok");

    assert_eq!(0, writer.calls());
    assert!(drain(&log).is_empty());
    assert_eq!(revision_before, session_revision(&state));
}

#[test]
fn a_cas_conflict_after_a_successful_save_leaves_the_disk_ahead_of_the_resident_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    ctx.io = Arc::new(CommitInjectingTaskIo::new(Arc::clone(&state), 1)) as Arc<dyn TaskIo>;

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("a CAS conflict is a normal skip");

    assert!(drain(&log).is_empty(), "競合時は emit しない");
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"],
        "config.json だけが先行する"
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done"]
    );
}

#[test]
fn the_next_unknown_status_event_makes_a_stale_resident_config_catch_up() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let first = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    ctx.io = Arc::new(CommitInjectingTaskIo::new(Arc::clone(&state), 1)) as Arc<dyn TaskIo>;
    handle_change(&TaskFileChange::Upserted(first), &ctx).expect("a CAS conflict is a normal skip");
    drain(&log);
    ctx.io = Arc::new(FsTaskIo) as Arc<dyn TaskIo>;
    let second = write_md(
        dir.path(),
        "tasks/b.md",
        &task_md_with_status("B", "Blocked"),
    );

    handle_change(&TaskFileChange::Upserted(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Review", "Blocked"]
    );
}

#[test]
fn a_known_status_event_does_not_make_a_stale_resident_config_catch_up() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    let first = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    ctx.io = Arc::new(CommitInjectingTaskIo::new(Arc::clone(&state), 1)) as Arc<dyn TaskIo>;
    handle_change(&TaskFileChange::Upserted(first), &ctx).expect("a CAS conflict is a normal skip");
    drain(&log);
    ctx.io = Arc::new(FsTaskIo) as Arc<dyn TaskIo>;
    let second = write_md(dir.path(), "tasks/b.md", &task_md_with_status("B", "Todo"));

    handle_change(&TaskFileChange::Upserted(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!(
        "task-created", entries[0].0,
        "既知 status は足切りで disk を読まないため収束を早めない"
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done"]
    );
}

#[test]
fn a_retrying_rescan_writes_the_config_only_once_for_unchanged_input() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, mut ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    ctx.io = Arc::new(CommitInjectingTaskIo::new(Arc::clone(&state), 1)) as Arc<dyn TaskIo>;

    handle_change(&TaskFileChange::Rescan, &ctx).expect("handler ok");

    assert_eq!(
        1,
        writer.calls(),
        "2 周目は読み直した config が既に新カラムを持つので persist されない"
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Review"],
        "書き込み 0 回の周でも resident は disk へ追いつく"
    );
}

#[test]
fn a_retrying_rescan_picks_up_a_status_that_appeared_between_attempts() {
    let dir = TempDir::new().expect("tempdir");
    let writer = Arc::new(CountingConfigWriter::default());
    let (state, mut ctx, log) = build_installed_ctx_with_config_writer(
        dir.path(),
        Arc::clone(&writer) as Arc<dyn ConfigWriter + Send + Sync>,
    );
    seed_base_config(&state, dir.path());
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    let root = dir.path().to_path_buf();
    ctx.io = Arc::new(
        CommitInjectingTaskIo::new(Arc::clone(&state), 1).with_side_effect(Box::new(move || {
            write_md(&root, "tasks/b.md", &task_md_with_status("B", "Blocked"));
        })),
    ) as Arc<dyn TaskIo>;

    handle_change(&TaskFileChange::Rescan, &ctx).expect("handler ok");

    drain(&log);
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review", "Blocked"]
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Review", "Blocked"]
    );
    assert_eq!(
        2,
        writer.calls(),
        "入力が周をまたいで変わった場合は取りこぼさない側を優先して 2 回保存する"
    );
}

#[test]
fn a_retrying_rescan_keeps_a_column_another_writer_added_between_attempts() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    seed_base_config(&state, dir.path());
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_status("A", "Review"),
    );
    let root = dir.path().to_path_buf();
    ctx.io = Arc::new(
        CommitInjectingTaskIo::new(Arc::clone(&state), 1).with_side_effect(Box::new(move || {
            write_config_json(
                &root,
                r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1},{"name":"Idea","order":2}],"cardOrder":{},"doneColumn":"Done"}"#,
            );
        })),
    ) as Arc<dyn TaskIo>;

    handle_change(&TaskFileChange::Rescan, &ctx).expect("handler ok");

    drain(&log);
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Idea", "Review"]
    );
    assert_eq!(
        column_names_of(&resident_config(&state)),
        vec!["Todo", "Done", "Idea", "Review"]
    );
}

// ───────── batch 展開（changes_in_order / handle_batch） ─────────

#[test]
fn changes_in_order_puts_rescan_and_failures_before_removed_and_upserted() {
    let reported = failure(WatcherFailureKind::Io, "read error", Vec::new());
    let batch = FileChangeBatch {
        removed: vec![PathBuf::from("/tmp/x.md")],
        upserted: vec![PathBuf::from("/tmp/y.md")],
        rescan: true,
        errors: vec![reported.clone()],
    };

    assert_eq!(
        vec![
            TaskFileChange::Rescan,
            TaskFileChange::Failure(reported),
            TaskFileChange::Removed(PathBuf::from("/tmp/x.md")),
            TaskFileChange::Upserted(PathBuf::from("/tmp/y.md")),
        ],
        changes_in_order(&batch)
    );
}

/// 指定 path の読み込みだけを失敗させる `TaskIo`。batch の 1 件が失敗しても
/// 後続が処理されることを検証するために使う。
struct FailingReadIo {
    failing: PathBuf,
}

impl TaskIo for FailingReadIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        FsTaskIo.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        if path == self.failing {
            return Err(std::io::Error::from(std::io::ErrorKind::PermissionDenied).into());
        }
        FsTaskIo.read(path)
    }

    fn try_exists(&self, path: &Path) -> Result<bool, crate::task::io::TaskIoError> {
        FsTaskIo.try_exists(path)
    }
}

#[test]
fn a_change_that_cannot_be_read_does_not_stop_the_rest_of_the_batch() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, mut ctx, log) = build_installed_ctx(dir.path());
    let broken = write_md(dir.path(), "tasks/broken.md", &task_md("Broken"));
    let ok = write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    ctx.io = Arc::new(FailingReadIo {
        failing: broken.clone(),
    }) as Arc<dyn TaskIo>;

    handle_batch(&upserts_batch(vec![broken, ok]), &ctx);

    let entries = drain(&log);
    let names: Vec<&str> = entries.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(
        vec!["watcher-resync-required", "task-updated"],
        names,
        "読めなかった 1 件で batch を打ち切ってはならない（読めない md は rescan に委ねる）"
    );
    assert_eq!("tasks/ok.md", entries[1].1["payload"]["task"]["filePath"]);
}

#[test]
fn an_empty_batch_consumes_no_event_seq() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let before = state
        .active_session_identity()
        .expect("session is open")
        .version();

    handle_batch(&FileChangeBatch::default(), &ctx);

    assert!(drain(&log).is_empty(), "空 batch は何も emit しない");
    assert_eq!(
        before,
        state
            .active_session_identity()
            .expect("session is open")
            .version(),
        "空 batch は revision も eventSeq も進めない"
    );
}
