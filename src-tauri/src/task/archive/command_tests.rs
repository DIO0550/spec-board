use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::{ArchiveTaskArgs, UnarchiveTaskArgs};
use super::super::error::{
    ArchiveTaskCommandError, ArchiveTaskError, UnarchiveTaskCommandError, UnarchiveTaskError,
};
use super::{archive_task_impl, get_archived_tasks_impl, unarchive_task_impl, ArchivedTaskPayload};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;
use crate::task::create::args::CreateTaskArgs;
use crate::task::create::create_task_impl;
use crate::task::io::FsTaskIo;

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

fn create_args(title: &str) -> CreateTaskArgs {
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

fn archive_args(file_path: &str) -> ArchiveTaskArgs {
    ArchiveTaskArgs {
        file_path: file_path.into(),
    }
}

fn unarchive_args(file_path: &str) -> UnarchiveTaskArgs {
    UnarchiveTaskArgs {
        file_path: file_path.into(),
    }
}

// ---------------------------------------------------------------------------
// archive_task
// ---------------------------------------------------------------------------

#[test]
fn archive_moves_file_into_archive_and_removes_from_cache() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let abs = dir.path().join(task.file_path.as_str());
    assert!(abs.exists());

    archive_task_impl(&state, &FsTaskIo, archive_args(task.file_path.as_str()))
        .expect("archive should succeed");

    assert!(!abs.exists(), "original file should be moved away");
    let archived = dir
        .path()
        .join(".spec-board/archive")
        .join(task.file_path.as_str());
    assert!(archived.exists(), "archived copy should exist");
    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert!(snap.is_empty(), "cache should be empty");
}

#[test]
fn archive_rejects_task_with_children_and_keeps_everything() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let parent = create_task_impl(&state, &FsTaskIo, create_args("Parent")).expect("create");
    let mut child_args = create_args("Child");
    child_args.parent = Some(parent.file_path.as_str().to_string());
    create_task_impl(&state, &FsTaskIo, child_args).expect("create child");

    let result = archive_task_impl(&state, &FsTaskIo, archive_args(parent.file_path.as_str()));

    assert!(matches!(
        result,
        Err(ArchiveTaskCommandError::Validation(
            ArchiveTaskError::HasChildren { .. }
        ))
    ));
    assert!(dir.path().join(parent.file_path.as_str()).exists());
    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert_eq!(snap.len(), 2, "cache should be unchanged");
}

#[test]
fn archive_missing_task_returns_file_not_found() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = archive_task_impl(&state, &FsTaskIo, archive_args("tasks/missing.md"));

    assert!(matches!(
        result,
        Err(ArchiveTaskCommandError::Validation(
            ArchiveTaskError::FileNotFound(_)
        ))
    ));
}

#[test]
fn archive_without_project_returns_no_project_open() {
    let state = AppState::new();
    let result = archive_task_impl(&state, &FsTaskIo, archive_args("tasks/x.md"));
    assert!(matches!(
        result,
        Err(ArchiveTaskCommandError::NoProjectOpen)
    ));
}

#[test]
fn archive_collision_appends_numbered_suffix() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // 同じ相対パスのアーカイブ済みファイルを事前に置いて衝突させる。
    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let archived = dir
        .path()
        .join(".spec-board/archive")
        .join(task.file_path.as_str());
    fs::create_dir_all(archived.parent().expect("parent")).expect("mkdir");
    fs::write(&archived, "already archived").expect("seed collision");

    archive_task_impl(&state, &FsTaskIo, archive_args(task.file_path.as_str()))
        .expect("archive should succeed with numbered suffix");

    let numbered = archived.with_file_name(format!(
        "{}-2.md",
        Path::new(task.file_path.as_str())
            .file_stem()
            .and_then(|stem| stem.to_str())
            .expect("stem")
    ));
    assert!(numbered.exists(), "numbered destination should be used");
    assert_eq!(
        fs::read_to_string(&archived).expect("seeded file"),
        "already archived",
        "existing archive entry must stay intact"
    );
}

// ---------------------------------------------------------------------------
// get_archived_tasks
// ---------------------------------------------------------------------------

#[test]
fn get_archived_tasks_returns_empty_without_archive_dir() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let payload = get_archived_tasks_impl(&state).expect("should succeed");
    assert!(payload.tasks.is_empty());
}

#[test]
fn get_archived_tasks_returns_empty_without_project() {
    let state = AppState::new();
    let payload = get_archived_tasks_impl(&state).expect("should succeed");
    assert!(payload.tasks.is_empty());
}

#[test]
fn get_archived_tasks_lists_archived_entries_sorted_with_title_and_status() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let beta = create_task_impl(&state, &FsTaskIo, create_args("Beta")).expect("create");
    let alpha = create_task_impl(&state, &FsTaskIo, create_args("Alpha")).expect("create");
    archive_task_impl(&state, &FsTaskIo, archive_args(beta.file_path.as_str()))
        .expect("archive beta");
    archive_task_impl(&state, &FsTaskIo, archive_args(alpha.file_path.as_str()))
        .expect("archive alpha");

    let payload = get_archived_tasks_impl(&state).expect("should succeed");

    assert_eq!(
        payload.tasks,
        vec![
            ArchivedTaskPayload {
                file_path: alpha.file_path.as_str().to_string(),
                title: "Alpha".to_string(),
                status: Some("Todo".to_string()),
            },
            ArchivedTaskPayload {
                file_path: beta.file_path.as_str().to_string(),
                title: "Beta".to_string(),
                status: Some("Todo".to_string()),
            },
        ]
    );
}

#[test]
fn get_archived_tasks_falls_back_to_file_stem_for_broken_frontmatter() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let archived = dir.path().join(".spec-board/archive/tasks/broken-entry.md");
    fs::create_dir_all(archived.parent().expect("parent")).expect("mkdir");
    fs::write(&archived, "---\ntitle: [unclosed\n---\nbody").expect("write broken");

    let payload = get_archived_tasks_impl(&state).expect("should succeed");

    assert_eq!(payload.tasks.len(), 1);
    let entry = payload.tasks.first().expect("entry");
    assert_eq!(entry.file_path, "tasks/broken-entry.md");
    assert_eq!(entry.title, "broken-entry");
    assert_eq!(entry.status, None);
}

// ---------------------------------------------------------------------------
// unarchive_task
// ---------------------------------------------------------------------------

#[test]
fn unarchive_moves_file_back_and_keeps_cache_untouched() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    archive_task_impl(&state, &FsTaskIo, archive_args(&rel)).expect("archive");

    let payload = unarchive_task_impl(&state, &FsTaskIo, unarchive_args(&rel)).expect("unarchive");

    assert_eq!(payload.restored_file_path, rel);
    assert!(dir.path().join(&rel).exists(), "file should be restored");
    assert!(
        !dir.path().join(".spec-board/archive").join(&rel).exists(),
        "archive entry should be removed"
    );
    // cache は watcher 経路に委ねる契約なので、unarchive では変化しない。
    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert!(snap.is_empty());
}

#[test]
fn unarchive_collision_restores_with_numbered_suffix() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    archive_task_impl(&state, &FsTaskIo, archive_args(&rel)).expect("archive");
    // 復元先に同名ファイルを作って衝突させる。
    fs::write(dir.path().join(&rel), "occupied").expect("seed collision");

    let payload = unarchive_task_impl(&state, &FsTaskIo, unarchive_args(&rel)).expect("unarchive");

    let stem = Path::new(&rel)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .expect("stem");
    assert_eq!(
        payload.restored_file_path,
        rel.replace(&format!("{stem}.md"), &format!("{stem}-2.md"))
    );
    assert!(dir.path().join(&payload.restored_file_path).exists());
    assert_eq!(
        fs::read_to_string(dir.path().join(&rel)).expect("occupied file"),
        "occupied",
        "existing task file must stay intact"
    );
}

#[test]
fn unarchive_missing_entry_returns_file_not_found() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = unarchive_task_impl(&state, &FsTaskIo, unarchive_args("tasks/missing.md"));

    assert!(matches!(
        result,
        Err(UnarchiveTaskCommandError::Validation(
            UnarchiveTaskError::FileNotFound(_)
        ))
    ));
}

#[test]
fn unarchive_without_project_returns_no_project_open() {
    let state = AppState::new();
    let result = unarchive_task_impl(&state, &FsTaskIo, unarchive_args("tasks/x.md"));
    assert!(matches!(
        result,
        Err(UnarchiveTaskCommandError::NoProjectOpen)
    ));
}
