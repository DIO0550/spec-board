use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::{PurgeTrashedTaskArgs, RestoreTrashedTaskArgs};
use super::super::error::{
    PurgeTrashError, RestoreTrashedTaskCommandError, RestoreTrashedTaskError,
};
use super::{
    empty_trash_impl, get_trashed_tasks_impl, purge_trashed_task_impl, restore_trashed_task_impl,
};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;
use crate::task::create::args::CreateTaskArgs;
use crate::task::create::create_task_impl;
use crate::task::delete::args::DeleteTaskArgs;
use crate::task::delete::command::delete_task_impl;
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

fn delete_args(file_path: &str) -> DeleteTaskArgs {
    DeleteTaskArgs {
        file_path: file_path.into(),
        orphan_strategy: None,
    }
}

#[test]
fn delete_moves_file_into_trash_mirror() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();

    delete_task_impl(&state, &FsTaskIo, delete_args(&rel)).expect("delete");

    assert!(!dir.path().join(&rel).exists(), "original should be gone");
    assert!(
        dir.path().join(".spec-board/trash").join(&rel).exists(),
        "trashed copy should exist at the mirrored path"
    );
}

#[test]
fn get_trashed_tasks_lists_deleted_entries_with_deleted_at() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    delete_task_impl(&state, &FsTaskIo, delete_args(&rel)).expect("delete");

    let payload = get_trashed_tasks_impl(&state).expect("should succeed");

    assert_eq!(payload.tasks.len(), 1);
    let entry = payload.tasks.first().expect("entry");
    assert_eq!(entry.file_path, rel);
    assert_eq!(entry.title, "Target");
    assert_eq!(entry.status.as_deref(), Some("Todo"));
    let deleted_at = entry.deleted_at.as_deref().expect("deleted_at");
    assert!(
        deleted_at.ends_with('Z'),
        "deleted_at should be UTC RFC3339"
    );
}

#[test]
fn get_trashed_tasks_returns_empty_without_trash_dir() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let payload = get_trashed_tasks_impl(&state).expect("should succeed");
    assert!(payload.tasks.is_empty());
}

#[test]
fn restore_moves_file_back_and_keeps_cache_untouched() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    delete_task_impl(&state, &FsTaskIo, delete_args(&rel)).expect("delete");

    let payload = restore_trashed_task_impl(
        &state,
        &FsTaskIo,
        RestoreTrashedTaskArgs {
            file_path: rel.clone(),
        },
    )
    .expect("restore");

    assert_eq!(payload.restored_file_path, rel);
    assert!(dir.path().join(&rel).exists(), "file should be restored");
    assert!(
        !dir.path().join(".spec-board/trash").join(&rel).exists(),
        "trash entry should be removed"
    );
    // cache は watcher 経路に委ねる契約なので、restore では変化しない。
    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert!(snap.is_empty());
}

#[test]
fn restore_collision_restores_with_numbered_suffix() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    delete_task_impl(&state, &FsTaskIo, delete_args(&rel)).expect("delete");
    fs::write(dir.path().join(&rel), "occupied").expect("seed collision");

    let payload = restore_trashed_task_impl(
        &state,
        &FsTaskIo,
        RestoreTrashedTaskArgs {
            file_path: rel.clone(),
        },
    )
    .expect("restore");

    let stem = Path::new(&rel)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .expect("stem");
    assert_eq!(
        payload.restored_file_path,
        rel.replace(&format!("{stem}.md"), &format!("{stem}-2.md"))
    );
    assert!(dir.path().join(&payload.restored_file_path).exists());
}

#[test]
fn restore_missing_entry_returns_file_not_found() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = restore_trashed_task_impl(
        &state,
        &FsTaskIo,
        RestoreTrashedTaskArgs {
            file_path: "tasks/missing.md".into(),
        },
    );

    assert!(matches!(
        result,
        Err(RestoreTrashedTaskCommandError::Validation(
            RestoreTrashedTaskError::FileNotFound(_)
        ))
    ));
}

#[test]
fn purge_removes_single_trash_entry() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, &FsTaskIo, create_args("Target")).expect("create");
    let rel = task.file_path.as_str().to_string();
    delete_task_impl(&state, &FsTaskIo, delete_args(&rel)).expect("delete");

    purge_trashed_task_impl(
        &state,
        PurgeTrashedTaskArgs {
            file_path: rel.clone(),
        },
    )
    .expect("purge");

    assert!(!dir.path().join(".spec-board/trash").join(&rel).exists());
    let payload = get_trashed_tasks_impl(&state).expect("list");
    assert!(payload.tasks.is_empty());
}

#[test]
fn purge_missing_entry_returns_file_not_found() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = purge_trashed_task_impl(
        &state,
        PurgeTrashedTaskArgs {
            file_path: "tasks/missing.md".into(),
        },
    );

    assert!(matches!(result, Err(PurgeTrashError::FileNotFound(_))));
}

#[test]
fn empty_trash_removes_all_entries_and_is_idempotent() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let alpha = create_task_impl(&state, &FsTaskIo, create_args("Alpha")).expect("create");
    let beta = create_task_impl(&state, &FsTaskIo, create_args("Beta")).expect("create");
    delete_task_impl(&state, &FsTaskIo, delete_args(alpha.file_path.as_str())).expect("delete");
    delete_task_impl(&state, &FsTaskIo, delete_args(beta.file_path.as_str())).expect("delete");

    empty_trash_impl(&state).expect("empty");
    assert!(!dir.path().join(".spec-board/trash").exists());
    // ゴミ箱不在でも成功する（冪等）。
    empty_trash_impl(&state).expect("empty again");

    let payload = get_trashed_tasks_impl(&state).expect("list");
    assert!(payload.tasks.is_empty());
}

#[test]
fn trash_commands_without_project_return_no_project_open() {
    let state = AppState::new();
    assert!(matches!(
        restore_trashed_task_impl(
            &state,
            &FsTaskIo,
            RestoreTrashedTaskArgs {
                file_path: "tasks/x.md".into()
            }
        ),
        Err(RestoreTrashedTaskCommandError::NoProjectOpen)
    ));
    assert!(matches!(
        purge_trashed_task_impl(
            &state,
            PurgeTrashedTaskArgs {
                file_path: "tasks/x.md".into()
            }
        ),
        Err(PurgeTrashError::NoProjectOpen)
    ));
    assert!(matches!(
        empty_trash_impl(&state),
        Err(PurgeTrashError::NoProjectOpen)
    ));
    let payload = get_trashed_tasks_impl(&state).expect("list");
    assert!(payload.tasks.is_empty());
}
