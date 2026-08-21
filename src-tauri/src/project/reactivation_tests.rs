use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use tempfile::TempDir;

use super::{run_reactivation_resync, ReactivationResyncOutcome};
use crate::config::{
    label_registry_store, milestone_registry_store, Column, Config, ConfigWriter, FsConfigWriter,
};
use crate::project::open_test_support::open_from_disk;
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

fn resync(
    state: &Arc<AppState>,
    snapshot: &ProjectSessionSnapshot,
    root: &Path,
    io: &dyn TaskIo,
    log: &EmitLog,
) -> ReactivationResyncOutcome {
    resync_with_config_writer(state, snapshot, root, io, &FsConfigWriter, log)
}

/// config の書き込みだけ差し替えて resync する。書き込み回数の計数と失敗注入に使う。
fn resync_with_config_writer(
    state: &Arc<AppState>,
    snapshot: &ProjectSessionSnapshot,
    root: &Path,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
    log: &EmitLog,
) -> ReactivationResyncOutcome {
    run_reactivation_resync(
        state,
        &snapshot.identity(),
        io,
        &label_registry_store(root),
        &milestone_registry_store(root),
        config_writer,
        &collecting_emit(log),
    )
}

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

/// `.spec-board/GUIDE.md` を読む。存在しなければ `None`。
fn read_guide(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(".spec-board").join("GUIDE.md")).ok()
}

/// `.spec-board/config.json` を保存済み `Config` として読む。
fn read_saved_config(root: &Path) -> Config {
    let raw = fs::read_to_string(root.join(".spec-board").join("config.json"))
        .expect("config.json should exist");
    serde_json::from_str(&raw).expect("saved config.json should parse")
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

fn column_names_of(config: &Config) -> Vec<&str> {
    config
        .columns
        .iter()
        .map(|column| column.name.as_str())
        .collect()
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

// ───────── 背景 resync 経路の reconcile ─────────

/// `Todo(0)` / `Done(1)` の config を置く。
fn write_base_config(root: &Path) {
    write_spec_board_file(
        root,
        "config.json",
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
}

#[test]
fn background_resync_reconciles_an_unknown_status_added_while_backgrounded() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-2.md", "Task two", "Review");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let writer = CountingConfigWriter::default();

    let outcome =
        resync_with_config_writer(&state, &snapshot, dir.path(), &FsTaskIo, &writer, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    assert_eq!(1, writer.calls());
    let saved = read_saved_config(dir.path());
    assert_eq!(column_names_of(&saved), vec!["Todo", "Done", "Review"]);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!(EVENT_RESYNC_REQUIRED, events[0].0);
    let resident = state
        .require_session_snapshot()
        .expect("session stays open")
        .config()
        .clone();
    assert_eq!(column_names_of(&resident), vec!["Todo", "Done", "Review"]);
}

#[test]
fn background_resync_refreshes_the_guide_markdown_with_the_new_column() {
    let dir = tempdir();
    write_base_config(dir.path());
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Review");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Review"));
}

#[test]
fn background_resync_does_not_rewrite_the_guide_when_the_config_is_missing_or_broken() {
    struct Case {
        label: &'static str,
        replacement: Option<&'static str>,
    }

    let cases = vec![
        Case {
            label: "config.json が削除された",
            replacement: None,
        },
        Case {
            label: "config.json が壊れている",
            replacement: Some("{ not json"),
        },
    ];

    for case in cases {
        let dir = tempdir();
        write_base_config(dir.path());
        write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Todo");
        let state = Arc::new(AppState::new());
        let snapshot = open_from_disk(&state, dir.path());
        let guide_before = read_guide(dir.path()).expect("cold open writes GUIDE.md");
        match case.replacement {
            Some(content) => write_spec_board_file(dir.path(), "config.json", content),
            None => fs::remove_file(dir.path().join(".spec-board").join("config.json"))
                .expect("remove config.json"),
        }
        // resident の知らない status を置いても、config を読めない以上何も書かない。
        write_task_md_with_status(dir.path(), "task-2.md", "Task two", "Review");
        let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
        let writer = CountingConfigWriter::default();

        resync_with_config_writer(&state, &snapshot, dir.path(), &FsTaskIo, &writer, &log);

        assert_eq!(0, writer.calls(), "case: {}", case.label);
        assert_eq!(
            read_guide(dir.path()).as_deref(),
            Some(guide_before.as_str()),
            "case: {}",
            case.label
        );
        let resident = state
            .require_session_snapshot()
            .expect("session stays open")
            .config()
            .clone();
        assert_eq!(
            resident,
            Config::default(),
            "config を読めない場合は既定値へ倒れる: case: {}",
            case.label
        );
        if case.replacement.is_none() {
            assert!(
                !dir.path().join(".spec-board").join("config.json").exists(),
                "削除された config.json を作り直さない: case: {}",
                case.label
            );
        }
    }
}

#[test]
fn background_resync_writes_nothing_when_the_disk_is_unchanged() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_task_md(dir.path(), "task-1.md", "Task one");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let writer = CountingConfigWriter::default();

    let outcome =
        resync_with_config_writer(&state, &snapshot, dir.path(), &FsTaskIo, &writer, &log);

    assert_eq!(ReactivationResyncOutcome::Unchanged, outcome);
    assert_eq!(0, writer.calls());
    assert!(emitted(&log).is_empty());
}

#[test]
fn a_reconciled_column_survives_a_second_resync() {
    let dir = tempdir();
    write_base_config(dir.path());
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Review");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);
    let after_first = state
        .require_session_snapshot()
        .expect("session stays open");

    let writer = CountingConfigWriter::default();
    let outcome =
        resync_with_config_writer(&state, &after_first, dir.path(), &FsTaskIo, &writer, &log);

    assert_eq!(ReactivationResyncOutcome::Unchanged, outcome);
    assert_eq!(0, writer.calls());
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn a_failed_reconcile_save_keeps_the_resident_config_and_the_session_intact() {
    let dir = tempdir();
    write_base_config(dir.path());
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Review");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    let outcome = resync_with_config_writer(
        &state,
        &snapshot,
        dir.path(),
        &FsTaskIo,
        &FailingConfigWriter,
        &log,
    );

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    let current = state
        .require_session_snapshot()
        .expect("session stays open");
    assert_eq!(column_names_of(current.config()), vec!["Todo", "Done"]);
    assert_eq!(1, current.load_warnings().len());
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback,
        current.load_warnings()[0].code
    );
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done"]
    );
}

#[test]
fn a_concurrent_commit_does_not_make_the_reconcile_write_twice() {
    let dir = tempdir();
    write_base_config(dir.path());
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Review");
    let io = CommitInjectingTaskIo::new(Arc::clone(&state), 1);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let writer = CountingConfigWriter::default();

    let outcome = resync_with_config_writer(&state, &snapshot, dir.path(), &io, &writer, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    assert_eq!(
        1,
        writer.calls(),
        "2 周目は disk に新カラムがあるので reconcile が no-op になる"
    );
    assert_eq!(
        column_names_of(&read_saved_config(dir.path())),
        vec!["Todo", "Done", "Review"]
    );
}

#[test]
fn background_resync_keeps_an_update_columns_change_that_landed_just_before_it() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Todo");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());

    crate::config::update_columns::update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        crate::config::update_columns::UpdateColumnsArgs {
            columns: Some(vec![
                Column {
                    name: "Todo".into(),
                    order: 0,
                    color: None,
                    wip_limit: None,
                },
                Column {
                    name: "Done".into(),
                    order: 1,
                    color: None,
                    wip_limit: None,
                },
                Column {
                    name: "Idea".into(),
                    order: 2,
                    color: None,
                    wip_limit: None,
                },
            ]),
            done_column: None,
            renames: None,
        },
    )
    .expect("update_columns adds the Idea column");
    write_task_md_with_status(dir.path(), "task-2.md", "Task two", "Review");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    resync(&state, &snapshot, dir.path(), &FsTaskIo, &log);

    let saved = read_saved_config(dir.path());
    assert_eq!(
        column_names_of(&saved),
        vec!["Todo", "Done", "Idea", "Review"],
        "reconcile は disk を読んでから書くので update_columns の変更を潰さない"
    );
}

#[test]
fn background_resync_commits_a_config_only_difference() {
    // watcher の CAS 競合で「disk の config.json は新カラムあり / resident は旧」に
    // なった状態。md には 1 件も変更が無くても resident が disk に追いつく。
    let dir = tempdir();
    write_base_config(dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Todo");
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_spec_board_file(
        dir.path(),
        "config.json",
        r#"{"version":1,"columns":[{"name":"Todo","order":0},{"name":"Done","order":1},{"name":"Review","order":2}],"cardOrder":{},"doneColumn":"Done"}"#,
    );
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let writer = CountingConfigWriter::default();

    let outcome =
        resync_with_config_writer(&state, &snapshot, dir.path(), &FsTaskIo, &writer, &log);

    assert_eq!(ReactivationResyncOutcome::Committed, outcome);
    assert_eq!(0, writer.calls());
    let resident = state
        .require_session_snapshot()
        .expect("session stays open")
        .config()
        .clone();
    assert_eq!(column_names_of(&resident), vec!["Todo", "Done", "Review"]);
    let events = emitted(&log);
    assert_eq!(1, events.len());
    assert_eq!(EVENT_RESYNC_REQUIRED, events[0].0);
}

#[test]
fn a_retried_commit_still_leaves_the_guide_markdown_up_to_date() {
    // GUIDE.md を commit の後ろで書くと、1 周目の競合で retry へ抜けたときに
    // 2 周目の reconcile が no-op になり、書き直す機会が二度と来ない。
    let dir = tempdir();
    write_base_config(dir.path());
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, dir.path());
    write_task_md_with_status(dir.path(), "task-1.md", "Task one", "Review");
    let io = CommitInjectingTaskIo::new(Arc::clone(&state), 1);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));

    resync(&state, &snapshot, dir.path(), &io, &log);

    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Review"));
}
