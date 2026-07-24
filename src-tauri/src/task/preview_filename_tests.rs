use std::sync::Arc;

use serde_json::json;
use tempfile::TempDir;

use super::*;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;
use crate::task::create::args::CreateTaskArgs;
use crate::task::create::command::create_task_impl;
use crate::task::io::FsTaskIo;

// --- args serde ---

#[test]
fn deserialize_full_args() {
    let json = json!({
        "title": "My Task",
        "explicitFilename": "custom-name.md",
        "parentFilePath": "tasks/parent.md"
    });
    let args: PreviewTaskFilenameArgs = serde_json::from_value(json).unwrap();
    assert_eq!(args.title, "My Task");
    assert_eq!(args.explicit_filename.as_deref(), Some("custom-name.md"));
    assert_eq!(args.parent_file_path.as_deref(), Some("tasks/parent.md"));
}

#[test]
fn deserialize_title_only() {
    let json = json!({ "title": "My Task" });
    let args: PreviewTaskFilenameArgs = serde_json::from_value(json).unwrap();
    assert_eq!(args.title, "My Task");
    assert!(args.explicit_filename.is_none());
    assert!(args.parent_file_path.is_none());
}

#[test]
fn deserialize_empty_title_succeeds() {
    let json = json!({ "title": "" });
    let args: PreviewTaskFilenameArgs = serde_json::from_value(json).unwrap();
    assert_eq!(args.title, "");
}

#[test]
fn deserialize_missing_title_fails() {
    let json = json!({ "explicitFilename": "name.md" });
    assert!(serde_json::from_value::<PreviewTaskFilenameArgs>(json).is_err());
}

#[test]
fn deserialize_extra_fields_ignored() {
    let json = json!({
        "title": "Task",
        "unknownField": 42,
        "anotherExtra": true
    });
    let args: PreviewTaskFilenameArgs = serde_json::from_value(json).unwrap();
    assert_eq!(args.title, "Task");
}

// --- command impl ---

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &std::path::Path) {
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

fn make_args(title: &str) -> PreviewTaskFilenameArgs {
    PreviewTaskFilenameArgs {
        title: title.to_string(),
        explicit_filename: None,
        parent_file_path: None,
    }
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

#[test]
fn preview_returns_pending_without_project() {
    let state = AppState::new();
    let result = preview_task_filename_impl(&state, make_args("Hello")).unwrap();
    assert!(matches!(result, PreviewTaskFilenamePayload::Pending));
}

#[test]
fn preview_returns_path_for_valid_title() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = preview_task_filename_impl(&state, make_args("Hello World")).unwrap();
    match result {
        PreviewTaskFilenamePayload::Path {
            file_name,
            rel_path,
            full_path,
        } => {
            assert_eq!(file_name, "hello-world.md");
            assert!(rel_path.starts_with("tasks/"));
            assert!(full_path.contains(dir.path().to_str().unwrap()));
        }
        other => panic!("expected Path, got {:?}", other),
    }
}

#[test]
fn preview_avoids_collision_with_existing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    create_task_impl(&state, &FsTaskIo, create_args("Hello World")).expect("create first");

    let result = preview_task_filename_impl(&state, make_args("Hello World")).unwrap();
    match result {
        PreviewTaskFilenamePayload::Path { file_name, .. } => {
            assert_eq!(file_name, "hello-world-1.md");
        }
        other => panic!("expected Path, got {:?}", other),
    }
}

#[test]
fn preview_with_parent_resolves_dir() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let parent = create_task_impl(&state, &FsTaskIo, create_args("Parent Task")).expect("create parent");

    let args = PreviewTaskFilenameArgs {
        title: "Child".to_string(),
        explicit_filename: None,
        parent_file_path: Some(parent.file_path.as_str().to_string()),
    };
    let result = preview_task_filename_impl(&state, args).unwrap();
    match result {
        PreviewTaskFilenamePayload::Path { rel_path, .. } => {
            assert!(rel_path.starts_with("tasks/"));
            assert!(rel_path.ends_with("child.md"));
        }
        other => panic!("expected Path, got {:?}", other),
    }
}

#[test]
fn preview_with_explicit_filename() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = PreviewTaskFilenameArgs {
        title: "Ignored Title".to_string(),
        explicit_filename: Some("my-custom.md".to_string()),
        parent_file_path: None,
    };
    let result = preview_task_filename_impl(&state, args).unwrap();
    match result {
        PreviewTaskFilenamePayload::Path { file_name, .. } => {
            assert_eq!(file_name, "my-custom.md");
        }
        other => panic!("expected Path, got {:?}", other),
    }
}

#[test]
fn preview_empty_explicit_with_valid_title() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = PreviewTaskFilenameArgs {
        title: "Valid Title".to_string(),
        explicit_filename: Some("".to_string()),
        parent_file_path: None,
    };
    let result = preview_task_filename_impl(&state, args).unwrap();
    match result {
        PreviewTaskFilenamePayload::Path { file_name, .. } => {
            assert_eq!(file_name, "valid-title.md");
        }
        other => panic!("expected Path, got {:?}", other),
    }
}

#[test]
fn preview_returns_invalid_for_empty_title() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let result = preview_task_filename_impl(&state, make_args("")).unwrap();
    match result {
        PreviewTaskFilenamePayload::Invalid { error } => {
            assert!(!error.is_empty());
        }
        other => panic!("expected Invalid, got {:?}", other),
    }
}
