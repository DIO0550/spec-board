//! `move_task_impl` の E2E テスト。
//!
//! tempdir 上に実ファイルを作り `open_project_impl` で AppState を立ち上げてから
//! `move_task_impl` を呼び、disk（task md / config.json）と in-memory cache の
//! 双方を検証する。

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use tempfile::TempDir;

use super::{move_task_impl, move_task_impl_with_config_io};
use crate::config::{load_or_default, CardOrder, Config, ConfigWriter};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::{SessionIdentity, SessionRevision};
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::move_task::args::MoveTaskArgs;
use crate::task::move_task::error::{MoveTaskCommandError, MoveTaskError};
use crate::task::task_index::TaskIndex;
use crate::task::warning::TaskWarningCode;
use crate::task::writer_test_support::{
    session_revision, session_write_ignore_len, CountingTaskIo,
};

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: &Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(
        state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn seed_md(root: &Path, rel: &str, content: &str) {
    let abs = root.join(rel);
    fs::create_dir_all(abs.parent().expect("has parent")).expect("create dirs");
    fs::write(abs, content).expect("write md");
}

/// 指定カラムの並びを `&str` の Vec として取り出す。キーが無ければ空 Vec。
fn column_paths<'a>(card_order: &'a CardOrder, column: &str) -> Vec<&'a str> {
    card_order
        .get(column)
        .map(|paths| paths.iter().map(|path| path.as_str()).collect())
        .unwrap_or_default()
}

fn read_config_json(project_root: &Path) -> Config {
    let raw = fs::read_to_string(project_root.join(".spec-board").join("config.json"))
        .expect("config.json exists");
    serde_json::from_str(&raw).expect("config.json is valid")
}

/// `config.json` に**書かれたままの** cardOrder を読む。
///
/// `Config` として deserialize すると `CardOrder` が canonical 化と dedupe をやり直すため、
/// 「ディスク上に何が永続化されたか」を主張するテストは `Config` 経由では検証できない。
fn read_raw_card_order(project_root: &Path, column: &str) -> Vec<String> {
    let raw = fs::read_to_string(project_root.join(".spec-board").join("config.json"))
        .expect("config.json exists");
    let value: serde_json::Value = serde_json::from_str(&raw).expect("config.json is valid json");
    value["cardOrder"][column]
        .as_array()
        .map(|paths| {
            paths
                .iter()
                .map(|path| path.as_str().expect("path is a string").to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// `open_project_impl` の前に `.spec-board/config.json` を書き出し、初期 cardOrder を仕込む。
fn seed_config_with_card_order(root: &Path, entries: &[(&str, &[&str])]) {
    let mut config = Config::default();
    for (column, paths) in entries {
        config.card_order.set_column(column, paths);
    }
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(
        dir.join("config.json"),
        serde_json::to_string_pretty(&config).expect("serialize config"),
    )
    .expect("write config.json");
}

/// 既定 3 カラム（`Todo` / `In Progress` / `Done`）の `config.json` を置く。
///
/// config が無いまま open するとタスクの status からカラムが生成されるため、
/// 既定カラム間の move を前提にするテストはその前提を明示的に置く。
fn seed_default_config(root: &Path) {
    seed_config_with_card_order(root, &[]);
}

/// `.spec-board/config.json` を canonical 化を挟まず生の文字列のまま置く。
fn seed_raw_config_json(root: &Path, json: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("config.json"), json).expect("write config.json");
}

/// AppState が今まさに保持している board 表示順を、move の期待値として取り出す。
///
/// 既存テストは「誰も割り込んでいない」状況を作っているため、期待値は常に現在の
/// 並びと一致する。ここを経由させることで、並び規則を変えたときにテストごとの
/// ハードコードを直して回らずに済む。project 未 open のテストでは空を返す
/// （`NoProjectOpen` が照合より先に返るため期待値は使われない）。
fn current_board_order(state: &AppState, column: &str) -> Vec<String> {
    let snapshot = state.session_snapshot().expect("state lock is healthy");
    let Some(snapshot) = snapshot else {
        return Vec::new();
    };
    let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
    index.board_order_of_column(snapshot.config(), column)
}

/// 期待値は現在の board 表示順で埋める。
///
/// conflict を意図的に起こすテストは、この helper を使わず `MoveTaskArgs` を
/// 直接構築して期待値をずらす。
fn make_args(
    state: &AppState,
    file_path: &str,
    from: &str,
    to: &str,
    to_paths: &[&str],
) -> MoveTaskArgs {
    MoveTaskArgs {
        file_path: file_path.to_string(),
        from_column: from.to_string(),
        to_column: to.to_string(),
        to_column_file_paths: to_paths.iter().map(|s| s.to_string()).collect(),
        expected_to_column_order: current_board_order(state, to),
    }
}

#[derive(Default)]
struct FailingConfigWriter {
    calls: AtomicUsize,
}

impl FailingConfigWriter {
    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl ConfigWriter for FailingConfigWriter {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Err(std::io::Error::other("injected config write failure"))
    }
}

#[test]
fn cross_column_move_updates_status_on_disk() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let revision_before = session_revision(&state);

    let task = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert_eq!(task.status.as_str(), "Done");

    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md");
    assert!(content.contains("status: Done"), "{content}");
    assert_eq!(
        revision_before.as_u64() + 1,
        session_revision(&state).as_u64()
    );
}

#[test]
fn cross_column_move_removes_task_from_source_card_order() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md", "tasks/b.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(column_paths(&on_disk.card_order, "Todo"), ["tasks/b.md"]);
}

#[test]
fn cross_column_move_sets_destination_card_order_in_given_order() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/x.md", "tasks/a.md"],
        ),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        column_paths(&on_disk.card_order, "Done"),
        ["tasks/x.md", "tasks/a.md"]
    );
    let in_state = state.test_config().expect("lock").expect("config");
    assert_eq!(
        column_paths(&in_state.card_order, "Done"),
        ["tasks/x.md", "tasks/a.md"]
    );
}

#[test]
fn same_column_reorder_leaves_task_md_untouched() {
    let dir = tempdir();
    let original = "---\ntitle: A\nstatus: Todo\n---\nbody\n";
    seed_md(dir.path(), "tasks/a.md", original);
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let task = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Todo",
            &["tasks/b.md", "tasks/a.md"],
        ),
    )
    .expect("reorder should succeed");

    assert_eq!(task.status.as_str(), "Todo");
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md"),
        original
    );
}

#[test]
fn same_column_reorder_updates_card_order() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md", "tasks/b.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Todo",
            &["tasks/b.md", "tasks/a.md"],
        ),
    )
    .expect("reorder should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        column_paths(&on_disk.card_order, "Todo"),
        ["tasks/b.md", "tasks/a.md"]
    );
}

#[test]
fn move_removes_source_entry_written_with_backslash_separators() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    // 外部エディタや Windows 由来のツールが書いた表記を再現するため、
    // seed helper を通さず生の JSON を置く（helper は canonical 化してしまう）。
    seed_raw_config_json(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "In Progress", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": { "Todo": ["tasks\\a.md", "tasks\\b.md"] },
            "doneColumn": "Done"
        }"#,
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert_eq!(
        read_raw_card_order(dir.path(), "Todo"),
        ["tasks/b.md"],
        "backslash 表記のまま書き戻さず、canonical 表記で永続化する"
    );
    assert_eq!(read_raw_card_order(dir.path(), "Done"), ["tasks/a.md"]);
}

#[test]
fn same_column_noop_does_not_advance_revision_or_register_marker() {
    let dir = tempdir();
    let original = "---\ntitle: A\nstatus: Todo\n---\nbody\n";
    seed_md(dir.path(), "tasks/a.md", original);
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let revision_before = session_revision(&state);
    let config_before = read_config_json(dir.path());

    let task = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Todo", &["tasks/a.md"]),
    )
    .expect("identical reorder is a no-op");

    assert_eq!("Todo", task.status.as_str());
    assert_eq!(revision_before, session_revision(&state));
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(
        original,
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("read unchanged task")
    );
    assert_eq!(
        config_before.card_order,
        read_config_json(dir.path()).card_order
    );
}
#[test]
fn destination_card_order_drops_paths_without_a_file_on_disk() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/ghost.md", "tasks/a.md"],
        ),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(column_paths(&on_disk.card_order, "Done"), ["tasks/a.md"]);
}

#[test]
fn card_order_survives_reopening_the_project() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/x.md", "tasks/a.md"],
        ),
    )
    .expect("move should succeed");

    let reopened = Arc::new(AppState::new());
    open_with_noop(&reopened, dir.path());

    let config = reopened.test_config().expect("lock").expect("config");
    assert_eq!(
        column_paths(&config.card_order, "Done"),
        ["tasks/x.md", "tasks/a.md"]
    );
}

#[test]
fn empty_destination_paths_still_register_the_moved_task() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &[]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        column_paths(&on_disk.card_order, "Done"),
        ["tasks/a.md"],
        "移動先カラムの並びには移動したタスクが必ず載る"
    );
}

#[test]
fn destination_paths_missing_the_moved_task_get_it_appended() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/x.md"]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        column_paths(&on_disk.card_order, "Done"),
        ["tasks/x.md", "tasks/a.md"]
    );
}

#[test]
fn cross_column_move_keeps_children_and_reverse_links() {
    let dir = tempdir();
    // 親（移動対象）+ 子 + 親を links で参照するタスク。children / reverse_links は
    // scan で導出される派生値で、md の frontmatter には現れない。
    seed_md(
        dir.path(),
        "tasks/parent.md",
        "---\ntitle: Parent\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/child.md",
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/linker.md",
        "---\ntitle: Linker\nstatus: Todo\nlinks:\n  - tasks/parent.md\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let returned = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/parent.md",
            "Todo",
            "Done",
            &["tasks/parent.md"],
        ),
    )
    .expect("move should succeed");

    assert_eq!(
        returned
            .children
            .iter()
            .map(|p| p.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/child.md"],
        "戻り値の children が空になってはならない"
    );
    assert_eq!(
        returned
            .reverse_links
            .iter()
            .map(|p| p.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/linker.md"],
        "戻り値の reverse_links が空になってはならない"
    );

    let cached = state
        .test_tasks_snapshot()
        .expect("lock")
        .into_iter()
        .find(|t| t.file_path.as_str() == "tasks/parent.md")
        .expect("parent stays in cache");
    assert_eq!(
        cached
            .children
            .iter()
            .map(|p| p.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/child.md"]
    );
    assert_eq!(
        cached
            .reverse_links
            .iter()
            .map(|p| p.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/linker.md"]
    );
}

#[test]
fn cross_column_move_clears_parse_warnings_that_no_longer_apply() {
    let dir = tempdir();
    // status キーが無い md は scan 時に「status 欠落・既定値を使用」warning が付く。
    // 移動で status を書き込むので、この warning は残ってはならない。
    seed_md(dir.path(), "tasks/a.md", "---\ntitle: A\n---\n");
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let before = state
        .test_tasks_snapshot()
        .expect("lock")
        .into_iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("seeded task");
    assert!(
        before
            .warnings
            .iter()
            .any(|w| w.code == TaskWarningCode::MissingStatusUsedDefault),
        "前提: 移動前は status 欠落 warning が付いている: {:?}",
        before.warnings
    );

    let returned = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert!(
        !returned
            .warnings
            .iter()
            .any(|w| w.code == TaskWarningCode::MissingStatusUsedDefault),
        "status を書き込んだので欠落 warning は消えるべき: {:?}",
        returned.warnings
    );
    let cached = state
        .test_tasks_snapshot()
        .expect("lock")
        .into_iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("task stays in cache");
    assert!(!cached
        .warnings
        .iter()
        .any(|w| w.code == TaskWarningCode::MissingStatusUsedDefault));
}

#[test]
fn cross_column_move_keeps_parent_not_found_warning() {
    let dir = tempdir();
    // parent 不在は task 集合から導出される warning で、単一 md からは再判定できない。
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nparent: tasks/missing.md\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let returned = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert!(
        returned
            .warnings
            .iter()
            .any(|w| w.code == TaskWarningCode::ParentNotFound),
        "graph 由来 warning は引き継がれるべき: {:?}",
        returned.warnings
    );
}

#[test]
fn disk_success_conflict_returns_typed_error_and_resyncs_same_session() {
    struct AdvanceRevisionOnWrite<'a> {
        inner: FsTaskIo,
        state: &'a AppState,
        expected: SessionIdentity,
        advanced: AtomicBool,
    }

    impl TaskIo for AdvanceRevisionOnWrite<'_> {
        fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
            self.inner.ensure_dir(dir)
        }

        fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            self.inner.write_new(path, bytes)
        }

        fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            let result = self.inner.write_existing(path, bytes);
            if result.is_ok() && !self.advanced.swap(true, Ordering::SeqCst) {
                self.state
                    .commit_session_write(&self.expected, |_| ())
                    .expect("inject one resident revision advance");
            }
            result
        }

        fn remove(&self, path: &Path) -> Result<(), TaskIoError> {
            self.inner.remove(path)
        }

        fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError> {
            self.inner.read(path)
        }
    }

    let dir = tempdir();
    let original = "---\ntitle: A\nstatus: Todo\n---\n";
    seed_md(dir.path(), "tasks/a.md", original);
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let revision_before = session_revision(&state);
    let io = AdvanceRevisionOnWrite {
        inner: FsTaskIo,
        state: &state,
        expected: state
            .require_session_snapshot()
            .expect("session snapshot")
            .identity(),
        advanced: AtomicBool::new(false),
    };

    let error = move_task_impl(
        &state,
        &io,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("the original resident CAS must report its conflict");

    assert!(matches!(error, MoveTaskCommandError::SessionConflict(_)));
    assert!(fs::read_to_string(dir.path().join("tasks/a.md"))
        .expect("read moved task")
        .contains("status: Done"));
    let cached = state
        .test_tasks_snapshot()
        .expect("resident tasks")
        .into_iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("resynced task");
    assert_eq!("Done", cached.status.as_str());
    let resident_config = state
        .test_config()
        .expect("resident config lock")
        .expect("resident config");
    assert_eq!(
        column_paths(&resident_config.card_order, "Done"),
        ["tasks/a.md"]
    );
    assert_eq!(
        revision_before.as_u64() + 2,
        session_revision(&state).as_u64(),
        "injected advance and recovery commit each consume one revision"
    );
    assert_eq!(
        1,
        session_write_ignore_len(&state),
        "successful recovery preserves the self-write marker"
    );
}

#[test]
fn config_writer_failure_rolls_back_md_cleans_marker_and_keeps_revision() {
    let dir = tempdir();
    let original_md = "---\ntitle: A\nstatus: Todo\n---\n";
    seed_md(dir.path(), "tasks/a.md", original_md);
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let config_before = read_config_json(dir.path());
    let revision_before = session_revision(&state);
    let writer = FailingConfigWriter::default();

    let error = move_task_impl_with_config_io(
        &state,
        &FsTaskIo,
        &writer,
        &load_or_default,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("injected config failure must abort the move");

    assert!(matches!(error, MoveTaskCommandError::ConfigIo(_)));
    assert_eq!(1, writer.calls());
    assert_eq!(
        original_md,
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("read rolled back task")
    );
    assert_eq!(
        config_before.card_order,
        read_config_json(dir.path()).card_order
    );
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(revision_before, session_revision(&state));
    let resident = state
        .test_tasks_snapshot()
        .expect("resident tasks")
        .into_iter()
        .find(|task| task.file_path.as_str() == "tasks/a.md")
        .expect("resident task");
    assert_eq!("Todo", resident.status.as_str());
}

#[test]
fn duplicate_destination_paths_are_collapsed() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/x.md", "tasks/a.md", "tasks\\a.md", "tasks/x.md"],
        ),
    )
    .expect("move should succeed");

    assert_eq!(
        read_raw_card_order(dir.path(), "Done"),
        ["tasks/x.md", "tasks/a.md"],
        "同じパスが複数回並ぶことはない（初出優先）。config.json に書かれた値そのものを見る"
    );
}

#[test]
fn cross_column_move_registers_session_marker_and_advances_revision() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let revision_before = session_revision(&state);
    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert_eq!(1, session_write_ignore_len(&state));
    assert_eq!(
        revision_before.as_u64() + 1,
        session_revision(&state).as_u64()
    );
}

#[test]
fn returns_no_project_open_when_no_project_is_open() {
    let state = AppState::new();

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("move without a project should fail");

    assert!(
        matches!(err, MoveTaskCommandError::NoProjectOpen),
        "unexpected error: {err:?}"
    );
}

#[test]
fn returns_task_not_found_when_task_is_absent_from_cache() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/ghost.md",
            "Todo",
            "Done",
            &["tasks/ghost.md"],
        ),
    )
    .expect_err("missing task should fail");

    assert!(
        matches!(err, MoveTaskCommandError::TaskNotFound { .. }),
        "unexpected error: {err:?}"
    );
}

#[test]
fn returns_status_mismatch_when_from_column_is_stale() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: In Progress\n---\n",
    );
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("stale from_column should fail");

    assert!(
        matches!(
            err,
            MoveTaskCommandError::Validation(MoveTaskError::StatusMismatch { .. })
        ),
        "unexpected error: {err:?}"
    );

    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md");
    assert!(content.contains("status: In Progress"), "{content}");
}

#[test]
fn returns_unknown_column_when_source_column_is_absent() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Ghost", "Done", &["tasks/a.md"]),
    )
    .expect_err("unknown from_column should fail");

    assert!(
        matches!(
            &err,
            MoveTaskCommandError::UnknownColumn { column_name } if column_name == "Ghost"
        ),
        "unexpected error: {err:?}"
    );
}

#[test]
fn returns_unknown_column_when_destination_column_is_absent() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Ghost", &["tasks/a.md"]),
    )
    .expect_err("unknown to_column should fail");

    assert!(
        matches!(
            &err,
            MoveTaskCommandError::UnknownColumn { column_name } if column_name == "Ghost"
        ),
        "unexpected error: {err:?}"
    );
}

#[test]
fn destination_paths_are_normalized_before_being_persisted() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["./tasks/x.md", "tasks/a.md"],
        ),
    )
    .expect("move should succeed");

    assert_eq!(
        read_raw_card_order(dir.path(), "Done"),
        ["tasks/x.md", "tasks/a.md"],
        "`./` 付きの表記は正規化してから永続化する。config.json に書かれた値そのものを見る"
    );
}

#[test]
fn destination_paths_escaping_the_project_root_are_rejected() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let before = read_config_json(dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["../outside/secret.md", "tasks/a.md"],
        ),
    )
    .expect_err("project_root の外を指す並びは拒否されるべき");

    assert!(
        matches!(err, MoveTaskCommandError::InvalidPath(_)),
        "unexpected error: {err:?}"
    );
    assert_eq!(
        read_config_json(dir.path()).card_order,
        before.card_order,
        "拒否時は config.json を書き換えない"
    );
}

#[test]
fn returns_unknown_column_for_empty_column_names() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "", "", &["tasks/a.md"]),
    )
    .expect_err("empty column names should fail");

    assert!(
        matches!(
            &err,
            MoveTaskCommandError::UnknownColumn { column_name } if column_name.is_empty()
        ),
        "unexpected error: {err:?}"
    );
}

#[cfg(unix)]
#[test]
fn config_write_failure_restores_the_original_task_md() {
    use std::os::unix::fs::symlink;

    let dir = tempdir();
    let original = "---\ntitle: A\nstatus: Todo\n---\nbody\n";
    seed_md(dir.path(), "tasks/a.md", original);
    seed_default_config(dir.path());
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    // `write_config_json` は symlink 越しの書き込みを拒否するため、config.json だけを
    // 失敗させて「task md 書き込み成功 → config 書き込み失敗」の順序を再現する。
    let outside = tempdir();
    let target = outside.path().join("external.json");
    fs::write(&target, "keep").expect("write external");
    let config_path = dir.path().join(".spec-board").join("config.json");
    let _ = fs::remove_file(&config_path);
    symlink(&target, &config_path).expect("symlink config.json");

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("config write should fail");

    assert!(
        matches!(err, MoveTaskCommandError::ConfigIo(_)),
        "unexpected error: {err:?}"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md"),
        original,
        "config 書き込み失敗時は task md を元に戻す"
    );
    assert_eq!(fs::read_to_string(&target).expect("read external"), "keep");
}

#[cfg(unix)]
#[test]
fn config_write_failure_unregisters_the_self_write_marker() {
    use std::os::unix::fs::symlink;

    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let outside = tempdir();
    let target = outside.path().join("external.json");
    fs::write(&target, "keep").expect("write external");
    let config_path = dir.path().join(".spec-board").join("config.json");
    let _ = fs::remove_file(&config_path);
    symlink(&target, &config_path).expect("symlink config.json");

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("config write should fail");

    assert_eq!(0, session_write_ignore_len(&state));
}

#[test]
fn move_task_revision_exhausted_performs_zero_task_config_and_loader_io() {
    let dir = tempdir();
    let original_md = "---\ntitle: A\nstatus: Todo\n---\nbody\n";
    seed_md(dir.path(), "tasks/a.md", original_md);
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let resident_before = state
        .require_session_snapshot()
        .expect("resident snapshot before exhaustion");
    let status_before = resident_before
        .tasks()
        .get(Path::new("tasks/a.md"))
        .expect("resident task before exhaustion")
        .status
        .clone();
    let card_order_before = resident_before.config().card_order.clone();
    let config_path = dir.path().join(".spec-board").join("config.json");
    let config_disk_before = fs::read_to_string(&config_path).expect("seeded config");
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));

    let task_io = CountingTaskIo::default();
    let config_writer = FailingConfigWriter::default();
    let loader_calls = AtomicUsize::new(0);
    let counting_loader = |root: &Path| {
        loader_calls.fetch_add(1, Ordering::SeqCst);
        load_or_default(root)
    };

    let error = move_task_impl_with_config_io(
        &state,
        &task_io,
        &config_writer,
        &counting_loader,
        make_args(&state, "tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("revision exhaustion must reject the composite writer");

    assert!(matches!(error, MoveTaskCommandError::RevisionExhausted(_)));
    assert_eq!(0, task_io.calls(), "TaskIo must not be reached");
    assert_eq!(0, config_writer.calls(), "ConfigWriter must not be reached");
    assert_eq!(
        0,
        loader_calls.load(Ordering::SeqCst),
        "loader must not be reached"
    );
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(u64::MAX, session_revision(&state).as_u64());
    assert_eq!(
        original_md,
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("unchanged task")
    );
    assert_eq!(
        config_disk_before,
        fs::read_to_string(config_path).expect("unchanged config")
    );
    let resident_after = state
        .require_session_snapshot()
        .expect("resident snapshot after rejection");
    assert_eq!(
        status_before,
        resident_after.tasks()[Path::new("tasks/a.md")].status
    );
    assert_eq!(card_order_before, resident_after.config().card_order);
}

/// 宛先カラム（Done に x が居る）を「空だったはず」とする stale な期待値の args。
///
/// `make_args` は現在の board 表示順を期待値に入れてしまうため、conflict を起こす
/// テストは期待値を直接ずらして構築する。
fn stale_expectation_args(file_path: &str) -> MoveTaskArgs {
    MoveTaskArgs {
        file_path: file_path.to_string(),
        from_column: "Todo".to_string(),
        to_column: "Done".to_string(),
        to_column_file_paths: vec![file_path.to_string()],
        expected_to_column_order: Vec::new(),
    }
}

#[test]
fn card_order_conflict_leaves_task_md_and_config_json_untouched() {
    let dir = tempdir();
    let original_md = "---\ntitle: A\nstatus: Todo\n---\n";
    seed_md(dir.path(), "tasks/a.md", original_md);
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    seed_config_with_card_order(
        dir.path(),
        &[("Todo", &["tasks/a.md"]), ("Done", &["tasks/x.md"])],
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let config_disk_before =
        fs::read_to_string(dir.path().join(".spec-board/config.json")).expect("config.json exists");

    let error = move_task_impl(&state, &FsTaskIo, stale_expectation_args("tasks/a.md"))
        .expect_err("stale な期待値の移動は拒否されるべき");

    assert!(
        matches!(
            error,
            MoveTaskCommandError::Validation(MoveTaskError::CardOrderConflict { .. })
        ),
        "unexpected error: {error:?}"
    );
    assert_eq!(
        original_md,
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("unchanged task md")
    );
    assert_eq!(
        config_disk_before,
        fs::read_to_string(dir.path().join(".spec-board/config.json"))
            .expect("unchanged config.json")
    );
    let resident = state
        .test_tasks_snapshot()
        .expect("resident tasks")
        .into_iter()
        .find(|task| task.file_path.as_str() == "tasks/a.md")
        .expect("resident task");
    assert_eq!("Todo", resident.status.as_str());
}

#[test]
fn card_order_conflict_keeps_revision_and_registers_no_marker() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let revision_before = session_revision(&state);

    move_task_impl(&state, &FsTaskIo, stale_expectation_args("tasks/a.md"))
        .expect_err("stale な期待値の移動は拒否されるべき");

    assert_eq!(revision_before, session_revision(&state));
    assert_eq!(0, session_write_ignore_len(&state));
}

#[test]
fn card_order_conflict_does_not_reach_task_io_or_config_writer() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let task_io = CountingTaskIo::default();
    let config_writer = FailingConfigWriter::default();

    let error = move_task_impl_with_config_io(
        &state,
        &task_io,
        &config_writer,
        &load_or_default,
        stale_expectation_args("tasks/a.md"),
    )
    .expect_err("stale な期待値の移動は拒否されるべき");

    assert!(
        matches!(
            error,
            MoveTaskCommandError::Validation(MoveTaskError::CardOrderConflict { .. })
        ),
        "unexpected error: {error:?}"
    );
    assert_eq!(0, task_io.calls(), "TaskIo must not be reached");
    assert_eq!(0, config_writer.calls(), "ConfigWriter must not be reached");
}

#[test]
fn same_column_card_order_conflict_leaves_disk_revision_and_io_untouched() {
    // 同一カラム並び替えでも照合が効き、拒否は cross-column と同じく副作用ゼロで返る。
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md", "tasks/b.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let revision_before = session_revision(&state);
    let config_disk_before =
        fs::read_to_string(dir.path().join(".spec-board/config.json")).expect("config.json exists");
    let task_io = CountingTaskIo::default();
    let config_writer = FailingConfigWriter::default();

    let error = move_task_impl_with_config_io(
        &state,
        &task_io,
        &config_writer,
        &load_or_default,
        MoveTaskArgs {
            file_path: "tasks/a.md".to_string(),
            from_column: "Todo".to_string(),
            to_column: "Todo".to_string(),
            to_column_file_paths: vec!["tasks/b.md".to_string(), "tasks/a.md".to_string()],
            // 実際は [a, b] なのに [b, a] を前提にした stale な期待値。
            expected_to_column_order: vec!["tasks/b.md".to_string(), "tasks/a.md".to_string()],
        },
    )
    .expect_err("同一カラムでも stale な期待値は拒否されるべき");

    assert!(
        matches!(
            error,
            MoveTaskCommandError::Validation(MoveTaskError::CardOrderConflict { .. })
        ),
        "unexpected error: {error:?}"
    );
    assert_eq!(0, task_io.calls(), "TaskIo must not be reached");
    assert_eq!(0, config_writer.calls(), "ConfigWriter must not be reached");
    assert_eq!(revision_before, session_revision(&state));
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(
        config_disk_before,
        fs::read_to_string(dir.path().join(".spec-board/config.json"))
            .expect("unchanged config.json")
    );
}

#[test]
fn first_move_into_a_column_without_card_order_entry_succeeds() {
    // 一度も並び替えていないカラムは cardOrder にエントリ自体が無い。期待値が
    // cardOrder の生値（= 無い）ではなく board 表示順（id 昇順）と照合されることで、
    // 初回移動が拒否されない。
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/y.md",
        "---\ntitle: Y\nstatus: Done\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let task = move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            &state,
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/x.md", "tasks/a.md", "tasks/y.md"],
        ),
    )
    .expect("cardOrder 未登録のカラムへの初回移動は成功するべき");

    assert_eq!("Done", task.status.as_str());
}

#[test]
fn unrelated_reorder_in_the_source_column_does_not_reject_the_move() {
    // 移動元カラムは照合対象外。移動元への操作は対象を取り除くだけで、他のカードの
    // 並びが変わっていても結果は変わらない。
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/x.md",
        "---\ntitle: X\nstatus: Done\n---\n",
    );
    seed_config_with_card_order(
        dir.path(),
        &[
            ("Todo", &["tasks/b.md", "tasks/a.md"]),
            ("Done", &["tasks/x.md"]),
        ],
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    // FE が移動元を [a, b] だと思っていても（実際は [b, a]）、宛先の期待値さえ
    // 一致していれば移動は成功する。
    let task = move_task_impl(
        &state,
        &FsTaskIo,
        MoveTaskArgs {
            file_path: "tasks/a.md".to_string(),
            from_column: "Todo".to_string(),
            to_column: "Done".to_string(),
            to_column_file_paths: vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()],
            expected_to_column_order: vec!["tasks/x.md".to_string()],
        },
    )
    .expect("移動元カラムの無関係な並び替えでは拒否されないべき");

    assert_eq!("Done", task.status.as_str());
}

#[test]
fn parent_dir_segment_in_expected_order_rejects_before_matching() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let error = move_task_impl(
        &state,
        &FsTaskIo,
        MoveTaskArgs {
            file_path: "tasks/a.md".to_string(),
            from_column: "Todo".to_string(),
            to_column: "Done".to_string(),
            to_column_file_paths: vec!["tasks/a.md".to_string()],
            expected_to_column_order: vec!["../outside.md".to_string()],
        },
    )
    .expect_err("`..` を含む期待値は照合より前に拒否されるべき");

    assert!(
        matches!(error, MoveTaskCommandError::InvalidPath(_)),
        "unexpected error: {error:?}"
    );
}
