//! `add_link_impl` の結合テスト。
//!
//! tempfile + `NoopWatcherFactory` + `FsTaskIo` で実 FS 上の動作を検証する。

use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::AddLinkArgs;
use super::super::error::{AddLinkCommandError, AddLinkError};
use super::add_link_impl;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::SessionRevision;
use crate::state::AppState;
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

fn seed_md(root: &Path, rel: &str, content: &str) {
    let abs = root.join(rel);
    fs::create_dir_all(abs.parent().unwrap()).unwrap();
    fs::write(&abs, content).unwrap();
}

fn args_for(source: &str, target: &str) -> AddLinkArgs {
    AddLinkArgs {
        source_file_path: source.to_string(),
        target_file_path: target.to_string(),
    }
}

#[test]
fn add_link_writes_file_and_updates_cache_on_success() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md")).expect("ok");
    assert_eq!(task.file_path, "tasks/a.md");
    assert!(task.links.iter().any(|p| p.as_str() == "tasks/b.md"));

    let on_disk = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read");
    assert!(on_disk.contains("links:"));
    assert!(on_disk.contains("- tasks/b.md"));

    let snap = state.test_tasks_snapshot().expect("snapshot");
    let a = snap
        .iter()
        .find(|t| t.file_path == "tasks/a.md")
        .expect("a");
    assert!(a.links.iter().any(|p| p.as_str() == "tasks/b.md"));
    let b = snap
        .iter()
        .find(|t| t.file_path == "tasks/b.md")
        .expect("b");
    assert!(b.reverse_links.iter().any(|p| p.as_str() == "tasks/a.md"));
}

#[test]
fn add_link_noop_when_target_already_in_links() {
    let dir = tempdir();
    let initial_a = "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\nbody\n";
    seed_md(dir.path(), "tasks/a.md", initial_a);
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let before = fs::read(dir.path().join("tasks/a.md")).unwrap();
    let revision_before = session_revision(&state);
    let snap_before = state.test_tasks_snapshot().expect("snap");

    let _ = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect("noop returns Ok");

    let after = fs::read(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(before, after, "noop must not rewrite file");

    let snap_after = state.test_tasks_snapshot().expect("snap");
    assert_eq!(snap_before.len(), snap_after.len());

    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(revision_before, session_revision(&state));
}

#[test]
fn add_link_returns_source_task_on_noop() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let returned = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect("noop returns Ok");
    assert_eq!(returned.file_path, "tasks/a.md");
    assert!(returned.links.iter().any(|p| p.as_str() == "tasks/b.md"));
}

#[test]
fn add_link_returns_source_not_found_when_source_missing() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = add_link_impl(
        &state,
        &FsTaskIo,
        args_for("tasks/missing.md", "tasks/b.md"),
    )
    .expect_err("source absent");
    assert!(matches!(
        err,
        AddLinkCommandError::Validation(AddLinkError::SourceNotFound { .. })
    ));
}

#[test]
fn add_link_returns_target_not_found_when_target_missing() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = add_link_impl(
        &state,
        &FsTaskIo,
        args_for("tasks/a.md", "tasks/missing.md"),
    )
    .expect_err("target absent");
    assert!(matches!(
        err,
        AddLinkCommandError::Validation(AddLinkError::TargetNotFound { .. })
    ));
}

#[test]
fn add_link_returns_self_link_error_for_same_path() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/a.md"))
        .expect_err("self-link");
    assert!(matches!(
        err,
        AddLinkCommandError::Validation(AddLinkError::SelfLink { .. })
    ));
}

#[test]
fn add_link_registers_session_write_ignore_and_advances_revision() {
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
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let revision_before = session_revision(&state);
    let _ = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md")).expect("ok");

    let after = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(after.contains("- tasks/b.md"));
    assert_eq!(1, session_write_ignore_len(&state));
    assert_eq!(
        revision_before.as_u64() + 1,
        session_revision(&state).as_u64()
    );
}

/// scan で cycle member とマークされた source task に add_link しても、
/// cache 上の `parent=None` と `parentCycle` warning が崩れないこと。
#[test]
fn add_link_on_cycle_source_preserves_parent_none_and_cycle_warning() {
    use crate::task::warning::TaskWarningCode;

    let dir = tempdir();
    let root = dir.path();
    // A -> B -> A の循環。さらに link 先となる無関係 task C を用意。
    seed_md(
        root,
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n",
    );
    seed_md(
        root,
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n",
    );
    seed_md(root, "tasks/c.md", "---\ntitle: C\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), root);

    let returned = add_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/c.md"))
        .expect("add_link should succeed");

    assert!(
        returned.parent.is_none(),
        "cycle source must keep parent=None"
    );
    assert!(
        returned
            .warnings
            .iter()
            .any(|w| w.code == TaskWarningCode::ParentCycle),
        "cycle source must keep parentCycle warning"
    );
}

#[test]
fn add_link_revision_exhausted_performs_zero_task_io() {
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
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));
    let io = CountingTaskIo::default();

    let error = add_link_impl(&state, &io, args_for("tasks/a.md", "tasks/b.md"))
        .expect_err("revision exhaustion must reject the writer");

    assert!(matches!(error, AddLinkCommandError::RevisionExhausted(_)));
    assert_eq!(0, io.calls(), "preflight must run before every TaskIo call");
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(u64::MAX, session_revision(&state).as_u64());
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read unchanged source");
    assert!(!content.contains("links:"));
}
