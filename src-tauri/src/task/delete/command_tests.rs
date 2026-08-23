use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::DeleteTaskArgs;
use super::super::error::{DeleteTaskCommandError, DeleteTaskError};
use super::delete_task_impl;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::SessionRevision;
use crate::state::AppState;
use crate::task::create::args::CreateTaskArgs;
use crate::task::create::create_task_impl;
use crate::task::io::FsTaskIo;
use crate::task::writer_test_support::{
    session_revision, session_write_ignore_len, CountingTaskIo,
};

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn seed_md(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().expect("task parent")).expect("create task directory");
    fs::write(path, content).expect("seed task");
}

fn args_with_title(title: &str) -> CreateTaskArgs {
    CreateTaskArgs {
        draft: false,
        due: None,
        file_name: None,
        title: title.into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        links: Vec::new(),
        body: None,
    }
}

fn delete_args(file_path: &str) -> DeleteTaskArgs {
    DeleteTaskArgs {
        file_path: file_path.into(),
        orphan_strategy: None,
    }
}

// ---------------------------------------------------------------------------
// 正常系
// ---------------------------------------------------------------------------

#[test]
fn delete_childless_task_removes_file_and_cache() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, args_with_title("Target")).expect("create");
    let abs = dir.path().join(task.file_path().as_str());
    assert!(abs.exists());

    delete_task_impl(&state, &FsTaskIo, delete_args(task.file_path().as_str())).expect("delete");

    assert!(!abs.exists(), "file should be removed");
    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert!(snap.is_empty(), "cache should be empty");
}

#[test]
fn delete_task_leaves_other_tasks_in_cache() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let t1 = create_task_impl(&state, &FsTaskIo, args_with_title("One")).expect("create 1");
    let t2 = create_task_impl(&state, &FsTaskIo, args_with_title("Two")).expect("create 2");
    let t3 = create_task_impl(&state, &FsTaskIo, args_with_title("Three")).expect("create 3");

    delete_task_impl(&state, &FsTaskIo, delete_args(t2.file_path().as_str())).expect("delete");

    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert_eq!(2, snap.len());
    assert!(snap.iter().any(|t| t.file_path() == t1.file_path()));
    assert!(snap.iter().any(|t| t.file_path() == t3.file_path()));
    assert!(!snap.iter().any(|t| t.file_path() == t2.file_path()));
}

#[test]
fn delete_child_rebuilds_parent_children() {
    let dir = tempdir();
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
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    delete_task_impl(&state, &FsTaskIo, delete_args("tasks/child.md")).expect("delete child");

    let snap = state.test_tasks_snapshot().expect("snapshot");
    let parent = snap
        .iter()
        .find(|task| task.file_path().as_str() == "tasks/parent.md")
        .expect("parent remains");
    assert!(
        parent.children().is_empty(),
        "delete must match reopen-derived children"
    );
}

#[test]
fn delete_link_source_rebuilds_target_reverse_links() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/source.md",
        "---\ntitle: Source\nstatus: Todo\nlinks:\n  - tasks/target.md\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/target.md",
        "---\ntitle: Target\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    delete_task_impl(&state, &FsTaskIo, delete_args("tasks/source.md")).expect("delete source");

    let snap = state.test_tasks_snapshot().expect("snapshot");
    let target = snap
        .iter()
        .find(|task| task.file_path().as_str() == "tasks/target.md")
        .expect("target remains");
    assert!(
        target.reverse_links().is_empty(),
        "delete must match reopen-derived reverse links"
    );
}

#[test]
fn delete_task_registers_session_write_ignore_and_advances_revision() {
    let dir = tempdir();
    let abs = dir.path().join("tasks/watched.md");
    fs::create_dir_all(abs.parent().expect("task parent")).expect("create tasks directory");
    fs::write(&abs, "---\ntitle: Watched\nstatus: Todo\n---\n").expect("seed task");
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let before = session_revision(&state);

    delete_task_impl(&state, &FsTaskIo, delete_args("tasks/watched.md")).expect("delete");

    assert!(!abs.exists());
    assert_eq!(1, session_write_ignore_len(&state));
    assert_eq!(
        before.as_u64() + 1,
        session_revision(&state).as_u64(),
        "one successful writer commit advances revision exactly once"
    );
}

// ---------------------------------------------------------------------------
// 異常系
// ---------------------------------------------------------------------------

#[test]
fn delete_task_returns_no_project_open() {
    let state = AppState::new();
    let err =
        delete_task_impl(&state, &FsTaskIo, delete_args("tasks/a.md")).expect_err("should fail");
    assert!(matches!(err, DeleteTaskCommandError::NoProjectOpen));
}

#[test]
fn delete_task_returns_invalid_path_for_empty() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = delete_task_impl(&state, &FsTaskIo, delete_args("")).expect_err("should fail");
    match err {
        DeleteTaskCommandError::Validation(DeleteTaskError::InvalidPath(msg)) => {
            assert_eq!("empty", msg);
        }
        other => panic!("expected InvalidPath(empty), got {other:?}"),
    }
}

#[test]
fn delete_task_returns_invalid_path_for_non_md() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err =
        delete_task_impl(&state, &FsTaskIo, delete_args("tasks/foo.txt")).expect_err("should fail");
    assert!(matches!(
        err,
        DeleteTaskCommandError::Validation(DeleteTaskError::InvalidPath(_))
    ));
}

#[test]
fn delete_task_returns_file_not_found() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = delete_task_impl(&state, &FsTaskIo, delete_args("tasks/nonexistent.md"))
        .expect_err("should fail");
    assert!(matches!(
        err,
        DeleteTaskCommandError::Validation(DeleteTaskError::FileNotFound(_))
    ));
}

#[test]
fn delete_task_returns_has_children_and_preserves_file() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());

    let parent_md = "---\ntitle: Parent\nstatus: Todo\n---\n";
    let parent_abs = dir.path().join("tasks/parent.md");
    fs::create_dir_all(parent_abs.parent().unwrap()).unwrap();
    fs::write(&parent_abs, parent_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let mut child_args = args_with_title("Child");
    child_args.parent = Some("tasks/parent.md".into());
    create_task_impl(&state, &FsTaskIo, child_args).expect("create child");

    let snap_before = state.test_tasks_snapshot().expect("snapshot");
    let err = delete_task_impl(&state, &FsTaskIo, delete_args("tasks/parent.md"))
        .expect_err("should fail");
    match err {
        DeleteTaskCommandError::Validation(DeleteTaskError::HasChildren { path, .. }) => {
            assert_eq!("tasks/parent.md", path);
        }
        other => panic!("expected HasChildren, got {other:?}"),
    }

    assert!(parent_abs.exists(), "parent file should be preserved");
    let snap_after = state.test_tasks_snapshot().expect("snapshot");
    assert_eq!(
        snap_before.len(),
        snap_after.len(),
        "cache should be unchanged"
    );
}

#[test]
fn delete_task_revision_exhausted_performs_zero_task_io() {
    let dir = tempdir();
    let abs = dir.path().join("tasks/a.md");
    fs::create_dir_all(abs.parent().expect("task parent")).expect("create tasks directory");
    fs::write(&abs, "---\ntitle: A\nstatus: Todo\n---\n").expect("seed task");
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));
    let io = CountingTaskIo::default();

    let error = delete_task_impl(&state, &io, delete_args("tasks/a.md"))
        .expect_err("revision exhaustion must reject the writer");

    assert!(matches!(
        error,
        DeleteTaskCommandError::RevisionExhausted(_)
    ));
    assert_eq!(0, io.calls(), "preflight must run before every TaskIo call");
    assert!(abs.exists(), "rejected writer must not remove the task");
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(u64::MAX, session_revision(&state).as_u64());
}
