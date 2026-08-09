use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tempfile::TempDir;

use super::{run_reactivation_resync, ReactivationResyncOutcome};
use crate::config::{label_registry_store, milestone_registry_store, FsConfigWriter};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::ProjectSessionSnapshot;
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::watcher_event::emit_envelope_if_current;
use crate::watcher_event::envelope::{ResyncReason, ResyncRequiredPayload, EVENT_RESYNC_REQUIRED};

/// handler_tests.rs と同型の emit 収集 fake。
type EmitLog = Arc<Mutex<Vec<(String, serde_json::Value)>>>;

fn collecting_emit(log: &EmitLog) -> impl Fn(&str, serde_json::Value) + Sync + '_ {
    move |event, payload| {
        log.lock()
            .expect("emit log lock")
            .push((event.to_string(), payload));
    }
}

fn emitted(log: &EmitLog) -> Vec<(String, serde_json::Value)> {
    log.lock().expect("emit log lock").clone()
}

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn write_task_md(root: &Path, rel: &str, title: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(
        &absolute,
        format!("---\ntitle: {title}\nstatus: Todo\n---\n\nbody\n"),
    )
    .expect("write md");
}

fn write_spec_board_file(root: &Path, name: &str, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join(name), content).expect("write .spec-board file");
}

/// tempdir の実ファイルからコールドオープンして resident session を設置する。
fn open_from_disk(state: &Arc<AppState>, root: &Path) -> ProjectSessionSnapshot {
    let intent = OpenProjectIntent::try_from(root.to_str().expect("utf-8 path").to_string())
        .expect("valid intent");
    let labels_store = label_registry_store(intent.as_path());
    let milestones_store = milestone_registry_store(intent.as_path());
    open_project_impl(
        state,
        &intent,
        &labels_store,
        &milestones_store,
        &NoopWatcherFactory,
    )
    .expect("cold open succeeds");
    state
        .require_session_snapshot()
        .expect("session is installed")
}

fn resync(
    state: &Arc<AppState>,
    snapshot: &ProjectSessionSnapshot,
    root: &Path,
    io: &dyn TaskIo,
    log: &EmitLog,
) -> ReactivationResyncOutcome {
    run_reactivation_resync(
        state,
        &snapshot.identity(),
        io,
        &label_registry_store(root),
        &milestone_registry_store(root),
        &FsConfigWriter,
        &collecting_emit(log),
    )
}

fn write_task_md_with_status(root: &Path, rel: &str, title: &str, status: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(
        &absolute,
        format!("---\ntitle: {title}\nstatus: {status}\n---\n\nbody\n"),
    )
    .expect("write md");
}

/// 読み込みのたびに同一 session の commit を注入し、並行 writer との競合を再現する。
struct CommitInjectingTaskIo {
    state: Arc<AppState>,
    remaining_injections: AtomicU32,
}

impl CommitInjectingTaskIo {
    fn new(state: Arc<AppState>, injections: u32) -> Self {
        Self {
            state,
            remaining_injections: AtomicU32::new(injections),
        }
    }

    fn inject_commit(&self) {
        let consumed = self.remaining_injections.fetch_update(
            Ordering::SeqCst,
            Ordering::SeqCst,
            |remaining| remaining.checked_sub(1),
        );
        if consumed.is_err() {
            return;
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
    fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
        FsTaskIo.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        FsTaskIo.write_new(path, bytes)
    }

    fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        FsTaskIo.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), TaskIoError> {
        FsTaskIo.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError> {
        self.inject_commit();
        FsTaskIo.read(path)
    }
}

#[test]
fn unchanged_disk_commits_and_emits_nothing() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Unchanged, outcome);
    assert!(emitted(&log).is_empty());
    assert_eq!(
        snapshot.version(),
        state
            .require_session_snapshot()
            .expect("session stays open")
            .version()
    );
}

#[test]
fn changed_task_file_commits_once_and_emits_resync_required() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Old title");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md(dir.path(), "task-1.md", "New title");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!(EVENT_RESYNC_REQUIRED, events[0].0);
    assert_eq!(
        snapshot.version().revision.as_u64() + 1,
        events[0].1["revision"]
            .as_u64()
            .expect("revision is numeric")
    );
    let current = state
        .require_session_snapshot()
        .expect("session stays open");
    assert_eq!(
        snapshot.version().revision.as_u64() + 1,
        current.version().revision.as_u64()
    );
    assert!(current
        .tasks()
        .values()
        .any(|task| task.title.as_str() == "New title"));
}

#[test]
fn changed_labels_yml_is_picked_up() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    assert!(snapshot.labels().labels.is_empty());
    write_spec_board_file(dir.path(), "labels.yml", "labels:\n  - name: bug\n");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let labels = state
        .require_session_snapshot()
        .expect("session stays open")
        .labels()
        .clone();
    assert_eq!(1, labels.labels.len());
    assert_eq!("bug", labels.labels[0].name);
}

#[test]
fn changed_config_json_is_picked_up() {
    let dir = tempdir();
    // status は差し替え後の config が持つカラムに合わせる。未知 status を残すと
    // reconcile が末尾にカラムを足し、config 差し替えの取り込みと混ざる。
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Backlog");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_spec_board_file(
        dir.path(),
        "config.json",
        r#"{"version":1,"columns":[{"name":"Backlog","order":0}],"cardOrder":{}}"#,
    );
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let config = state
        .require_session_snapshot()
        .expect("session stays open")
        .config()
        .clone();
    assert_eq!(1, config.columns.len());
    assert_eq!("Backlog", config.columns[0].name.as_str());
}

#[test]
fn broken_config_falls_back_with_warning() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    assert!(snapshot.load_warnings().is_empty());
    write_spec_board_file(dir.path(), "config.json", "{ not json");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let current = state
        .require_session_snapshot()
        .expect("session stays open");
    assert_eq!(1, current.load_warnings().len());
    assert_eq!(1, emitted(&log).len());
}

#[test]
fn superseded_session_is_left_untouched() {
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_task_md(dir_a.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let stale = open_from_disk(&state, dir_a.path());
    write_task_md(dir_a.path(), "task-1.md", "Changed while backgrounded");
    let current_before = open_from_disk(&state, dir_b.path());
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &stale, dir_a.path(), &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Superseded, outcome);
    assert!(emitted(&log).is_empty());
    assert_eq!(
        current_before.version(),
        state
            .require_session_snapshot()
            .expect("project B stays open")
            .version()
    );
}

#[test]
fn scan_failure_emits_rescan_failed_diagnostic() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    let root = dir.path().to_path_buf();
    fs::remove_dir_all(&root).expect("remove project dir to make the scan fail");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, &root, &FsTaskIo, &log);

    assert_eq!(ReactivationResyncOutcome::Failed, outcome);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!("watcher-diagnostic", events[0].0);
    assert_eq!("rescanFailed", events[0].1["payload"]["code"]);
    assert_eq!(
        snapshot.version(),
        state
            .require_session_snapshot()
            .expect("session stays open")
            .version(),
        "a failed resync must not change resident state"
    );
}

#[test]
fn same_session_conflict_retries_then_commits() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Old title");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md(dir.path(), "task-1.md", "New title");
    let io = CommitInjectingTaskIo::new(Arc::clone(&state), 1);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &io, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!(EVENT_RESYNC_REQUIRED, events[0].0);
    assert!(state
        .require_session_snapshot()
        .expect("session stays open")
        .tasks()
        .values()
        .any(|task| task.title.as_str() == "New title"));
}

#[test]
fn repeated_conflict_gives_up_with_diagnostic() {
    let dir = tempdir();
    write_task_md(dir.path(), "task-1.md", "Old title");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md(dir.path(), "task-1.md", "New title");
    let io = CommitInjectingTaskIo::new(Arc::clone(&state), u32::MAX);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync(&state, &snapshot, dir.path(), &io, &log);

    assert_eq!(ReactivationResyncOutcome::Failed, outcome);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!("watcher-diagnostic", events[0].0);
    assert_eq!("rescanFailed", events[0].1["payload"]["code"]);
}

#[test]
fn emit_is_skipped_when_the_identity_is_no_longer_current() {
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_task_md(dir_a.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let stale = open_from_disk(&state, dir_a.path());
    open_from_disk(&state, dir_b.path());
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    emit_envelope_if_current(
        &state,
        &collecting_emit(&log),
        &stale.identity(),
        EVENT_RESYNC_REQUIRED,
        ResyncRequiredPayload {
            reason: ResyncReason::Rescan,
        },
    )
    .expect("stale identity is a normal skip, not an error");

    assert!(emitted(&log).is_empty());
}
