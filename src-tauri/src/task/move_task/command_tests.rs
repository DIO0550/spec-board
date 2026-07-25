//! `move_task_impl` の E2E テスト。
//!
//! tempdir 上に実ファイルを作り `open_project_impl` で AppState を立ち上げてから
//! `move_task_impl` を呼び、disk（task md / config.json）と in-memory cache の
//! 双方を検証する。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tempfile::TempDir;

use super::move_task_impl;
use crate::config::Config;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::move_task::args::MoveTaskArgs;
use crate::task::move_task::error::{MoveTaskCommandError, MoveTaskError};
use crate::task::warning::TaskWarningCode;

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

fn read_config_json(project_root: &Path) -> Config {
    let raw = fs::read_to_string(project_root.join(".spec-board").join("config.json"))
        .expect("config.json exists");
    serde_json::from_str(&raw).expect("config.json is valid")
}

/// `open_project_impl` の前に `.spec-board/config.json` を書き出し、初期 cardOrder を仕込む。
fn seed_config_with_card_order(root: &Path, entries: &[(&str, &[&str])]) {
    let mut config = Config::default();
    for (column, paths) in entries {
        config.card_order.insert(
            (*column).to_string(),
            paths.iter().map(|p| (*p).to_string()).collect(),
        );
    }
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(
        dir.join("config.json"),
        serde_json::to_string_pretty(&config).expect("serialize config"),
    )
    .expect("write config.json");
}

fn make_args(file_path: &str, from: &str, to: &str, to_paths: &[&str]) -> MoveTaskArgs {
    MoveTaskArgs {
        file_path: file_path.to_string(),
        from_column: from.to_string(),
        to_column: to.to_string(),
        to_column_file_paths: to_paths.iter().map(|s| s.to_string()).collect(),
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let task = move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert_eq!(task.status.as_str(), "Done");

    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md");
    assert!(content.contains("status: Done"), "{content}");
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec!["tasks/b.md".to_string()])
    );
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/x.md", "tasks/a.md"]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Done"),
        Some(&vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()])
    );
    let in_state = state.config().expect("lock").expect("config");
    assert_eq!(
        in_state.card_order.get("Done"),
        Some(&vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()])
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
        make_args("tasks/a.md", "Todo", "Todo", &["tasks/b.md", "tasks/a.md"]),
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
        make_args("tasks/a.md", "Todo", "Todo", &["tasks/b.md", "tasks/a.md"]),
    )
    .expect("reorder should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec!["tasks/b.md".to_string(), "tasks/a.md".to_string()])
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args(
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/ghost.md", "tasks/a.md"],
        ),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Done"),
        Some(&vec!["tasks/a.md".to_string()])
    );
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/x.md", "tasks/a.md"]),
    )
    .expect("move should succeed");

    let reopened = Arc::new(AppState::new());
    open_with_noop(&reopened, dir.path());

    let config = reopened.config().expect("lock").expect("config");
    assert_eq!(
        config.card_order.get("Done"),
        Some(&vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()])
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &[]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Done"),
        Some(&vec!["tasks/a.md".to_string()]),
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/x.md"]),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Done"),
        Some(&vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()])
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let returned = move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/parent.md", "Todo", "Done", &["tasks/parent.md"]),
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
        .tasks_snapshot()
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let before = state
        .tasks_snapshot()
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
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
        .tasks_snapshot()
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let returned = move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
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
fn switching_project_mid_command_leaves_the_new_project_cache_untouched() {
    // md 書き込みと in-memory commit の間にプロジェクトが切り替わる状況を、
    // write のタイミングで project_path を差し替える TaskIo で決定的に再現する。
    struct SwitchProjectOnWrite<'a> {
        inner: FsTaskIo,
        state: &'a AppState,
        switch_to: PathBuf,
    }

    impl TaskIo for SwitchProjectOnWrite<'_> {
        fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
            self.inner.ensure_dir(dir)
        }
        fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            self.inner.write_new(path, bytes)
        }
        fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            let result = self.inner.write_existing(path, bytes);
            self.state
                .set_project_path(Some(self.switch_to.clone()))
                .expect("swap project path");
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
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let other = tempdir();
    let io = SwitchProjectOnWrite {
        inner: FsTaskIo,
        state: &state,
        switch_to: other.path().to_path_buf(),
    };

    move_task_impl(
        &state,
        &io,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("disk 書き込みは旧プロジェクト視点で完了するので Ok を返す");

    // in-memory は一切変更されない（config も tasks キャッシュも旧プロジェクトのまま）。
    let cached = state
        .tasks_snapshot()
        .expect("lock")
        .into_iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("task stays in cache");
    assert_eq!(
        cached.status.as_str(),
        "Todo",
        "project 切替後は cache を書き換えない"
    );
    let in_state = state.config().expect("lock").expect("config");
    assert!(
        !in_state.card_order.contains_key("Done"),
        "project 切替後は in-memory config も書き換えない"
    );
}

#[test]
fn task_vanishing_before_commit_rolls_back_both_md_and_config() {
    // md 書き込みと in-memory commit の間に対象タスクが cache から消える状況
    // （並行 delete_task / 再 scan など）を、write のタイミングで cache を空にする
    // TaskIo で決定的に再現する。
    struct DropTaskOnWrite<'a> {
        inner: FsTaskIo,
        state: &'a AppState,
    }

    impl TaskIo for DropTaskOnWrite<'_> {
        fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
            self.inner.ensure_dir(dir)
        }
        fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            self.inner.write_new(path, bytes)
        }
        fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
            let result = self.inner.write_existing(path, bytes);
            self.state
                .with_tasks_cache_mut(|cache| cache.clear())
                .expect("clear cache");
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
    let original_md = "---\ntitle: A\nstatus: Todo\n---\n";
    seed_md(dir.path(), "tasks/a.md", original_md);
    seed_config_with_card_order(dir.path(), &[("Todo", &["tasks/a.md"])]);
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());
    let config_before = read_config_json(dir.path());

    let io = DropTaskOnWrite {
        inner: FsTaskIo,
        state: &state,
    };

    let err = move_task_impl(
        &state,
        &io,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("commit 時に対象が消えていれば失敗する");

    assert!(
        matches!(
            err,
            MoveTaskCommandError::Validation(MoveTaskError::TaskVanished { .. })
        ),
        "unexpected error: {err:?}"
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).expect("read md"),
        original_md,
        "task md は移動前に戻る"
    );
    assert_eq!(
        read_config_json(dir.path()).card_order,
        config_before.card_order,
        "config.json も移動前に戻る（片方だけ移動後に進ませない）"
    );
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
            "tasks/a.md",
            "Todo",
            "Done",
            &["tasks/x.md", "tasks/a.md", "tasks/a.md", "tasks/x.md"],
        ),
    )
    .expect("move should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Done"),
        Some(&vec!["tasks/x.md".to_string(), "tasks/a.md".to_string()]),
        "同じパスが複数回並ぶことはない（初出優先）"
    );
}

#[test]
fn cross_column_move_registers_the_task_path_as_self_write() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect("move should succeed");

    assert!(state
        .write_ignore()
        .should_ignore(dir.path().join("tasks/a.md"))
        .expect("registry lock"));
}

#[test]
fn returns_no_project_open_when_no_project_is_open() {
    let state = AppState::new();

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
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
        make_args("tasks/ghost.md", "Todo", "Done", &["tasks/ghost.md"]),
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
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let err = move_task_impl(
        &state,
        &FsTaskIo,
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
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
        make_args("tasks/a.md", "Ghost", "Done", &["tasks/a.md"]),
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
        make_args("tasks/a.md", "Todo", "Ghost", &["tasks/a.md"]),
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
        make_args("tasks/a.md", "", "", &["tasks/a.md"]),
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
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
        make_args("tasks/a.md", "Todo", "Done", &["tasks/a.md"]),
    )
    .expect_err("config write should fail");

    assert!(state.write_ignore().is_empty().expect("registry lock"));
}
