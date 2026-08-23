//! `remove_link_impl` の結合テスト。
//!
//! tempfile + `NoopWatcherFactory` + `FsTaskIo` で実 FS 上の動作を検証する。

use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::RemoveLinkArgs;
use super::super::error::{RemoveLinkCommandError, RemoveLinkError};
use super::remove_link_impl;
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

fn args_for(source: &str, target: &str) -> RemoveLinkArgs {
    RemoveLinkArgs {
        source_file_path: source.to_string(),
        target_file_path: target.to_string(),
    }
}

#[test]
fn removes_link_from_disk_and_cache() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\nbody\n",
    );
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task =
        remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md")).expect("ok");
    assert_eq!(task.file_path().as_str(), "tasks/a.md");
    assert!(
        task.links().is_empty(),
        "links should be empty, got {:?}",
        task.links()
    );

    let on_disk = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read");
    assert!(
        !on_disk.contains("links:"),
        "links key should be removed when last entry dropped, got {on_disk:?}"
    );

    let snap = state.test_tasks_snapshot().expect("snapshot");
    let a = snap
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/a.md")
        .expect("a");
    assert!(a.links().is_empty());
}

#[test]
fn removes_reverse_link_on_target() {
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

    // open_project の reverse_links 構築で b.reverse_links に a が入っている前提を確認。
    let snap_before = state.test_tasks_snapshot().expect("snap");
    let b_before = snap_before
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/b.md")
        .expect("b");
    assert!(
        b_before
            .reverse_links()
            .iter()
            .any(|p| p.as_str() == "tasks/a.md"),
        "precondition: b.reverse_links should contain a"
    );

    let _ = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md")).expect("ok");

    let snap_after = state.test_tasks_snapshot().expect("snap");
    let b_after = snap_after
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/b.md")
        .expect("b");
    assert!(
        !b_after
            .reverse_links()
            .iter()
            .any(|p| p.as_str() == "tasks/a.md"),
        "b.reverse_links should drop a, got {:?}",
        b_after.reverse_links()
    );
}

#[test]
fn noop_when_link_not_present() {
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

    let before = fs::read(dir.path().join("tasks/a.md")).unwrap();
    let revision_before = session_revision(&state);
    let snap_before = state.test_tasks_snapshot().expect("snap");

    let _ = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect("noop returns Ok");

    let after = fs::read(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(before, after, "noop must not rewrite file");

    let snap_after = state.test_tasks_snapshot().expect("snap");
    assert_eq!(snap_before.len(), snap_after.len());

    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(revision_before, session_revision(&state));
}

#[test]
fn idempotent_double_invocation() {
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

    let _ = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect("first call ok (Write)");
    let _ = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect("second call ok (NoOp)");
}

#[test]
fn succeeds_when_target_missing_from_cache() {
    let dir = tempdir();
    // target ファイルを seed せず、source.links だけ orphan link を持つ状態を作る。
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/missing.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = remove_link_impl(
        &state,
        &FsTaskIo,
        args_for("tasks/a.md", "tasks/missing.md"),
    )
    .expect("orphan link removal should succeed");
    assert!(task.links().is_empty());

    let on_disk = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read");
    assert!(
        !on_disk.contains("tasks/missing.md"),
        "orphan link should be removed from disk, got {on_disk:?}"
    );
}

#[test]
fn errors_source_not_found() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let err = remove_link_impl(
        &state,
        &FsTaskIo,
        args_for("tasks/missing.md", "tasks/b.md"),
    )
    .expect_err("source absent");
    assert!(matches!(
        err,
        RemoveLinkCommandError::Validation(RemoveLinkError::SourceNotFound { .. })
    ));
}

#[test]
fn errors_parse_failed_on_broken_frontmatter() {
    let dir = tempdir();
    // まず正常な frontmatter で seed → open_project で cache に乗せる。
    // その後ディスク側の source の frontmatter delimiter を欠落させ、
    // remove_link_impl の io.read + frontmatter::parse_bytes の経路で
    // ParseFailed を確実に発火させる。
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

    // open_project 後にディスクの source を壊す（先頭 `---` を除去）。
    fs::write(
        dir.path().join("tasks/a.md"),
        "title: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n",
    )
    .unwrap();

    let err = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md"))
        .expect_err("parse should fail on broken frontmatter");
    assert!(
        matches!(
            err,
            RemoveLinkCommandError::Validation(RemoveLinkError::ParseFailed(_))
        ),
        "expected ParseFailed, got {err:?}"
    );
}

#[test]
fn self_link_removal_returns_updated_reverse_links() {
    // self-link（source == target）の境界ケース: 手書き frontmatter で a.md
    // 自身を links に持つ状態を作る。remove_link 実行後、disk / cache の
    // a.md は links が空になり、reverse_links からも自分自身が除去される。
    // 戻り値の Task が cache と一致することを検証する（commit_cache 内で
    // target update 後に cache から再取得する設計の回帰テスト）。
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/a.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let returned =
        remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/a.md")).expect("ok");
    assert!(returned.links().is_empty());
    assert!(
        !returned
            .reverse_links()
            .iter()
            .any(|p| p.as_str() == "tasks/a.md"),
        "self-link returned task should not contain itself in reverse_links: {:?}",
        returned.reverse_links()
    );

    let snap = state.test_tasks_snapshot().expect("snap");
    let a = snap
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/a.md")
        .expect("a");
    assert_eq!(
        returned.reverse_links(),
        a.reverse_links(),
        "returned task reverse_links must match cache state"
    );
}

#[test]
fn registers_session_write_ignore_and_advances_revision() {
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

    let revision_before = session_revision(&state);
    let _ = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/b.md")).expect("ok");

    assert_eq!(1, session_write_ignore_len(&state));
    assert_eq!(
        revision_before.as_u64() + 1,
        session_revision(&state).as_u64()
    );
}

#[test]
fn remove_link_on_cycle_source_preserves_parent_none_and_cycle_warning() {
    use crate::task::warning::TaskWarningCode;

    let dir = tempdir();
    let root = dir.path();
    // A -> B -> A の循環。A には事前に C への link が貼られている。
    seed_md(
        root,
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\nlinks:\n  - tasks/c.md\n---\n",
    );
    seed_md(
        root,
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n",
    );
    seed_md(root, "tasks/c.md", "---\ntitle: C\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), root);

    let returned = remove_link_impl(&state, &FsTaskIo, args_for("tasks/a.md", "tasks/c.md"))
        .expect("remove_link should succeed");

    assert!(
        returned.parent().is_none(),
        "cycle source must keep effective parent=None"
    );
    assert!(
        returned
            .warnings()
            .iter()
            .any(|w| w.code == TaskWarningCode::ParentCycle),
        "cycle source must keep parentCycle warning"
    );
}

#[test]
fn remove_link_revision_exhausted_performs_zero_task_io() {
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
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));
    let io = CountingTaskIo::default();

    let error = remove_link_impl(&state, &io, args_for("tasks/a.md", "tasks/b.md"))
        .expect_err("revision exhaustion must reject the writer");

    assert!(matches!(
        error,
        RemoveLinkCommandError::RevisionExhausted(_)
    ));
    assert_eq!(0, io.calls(), "preflight must run before every TaskIo call");
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(u64::MAX, session_revision(&state).as_u64());
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read unchanged source");
    assert!(content.contains("- tasks/b.md"));
}
