use std::path::Path;

use super::*;
use crate::task::preview_filename::PreviewTaskFilenameArgs;
use crate::task::task_file_path::TaskFilePath;

fn args_with(title: &str) -> PreviewTaskFilenameArgs {
    PreviewTaskFilenameArgs {
        title: title.to_string(),
        explicit_filename: None,
        parent_file_path: None,
    }
}

fn args_with_explicit(title: &str, filename: &str) -> PreviewTaskFilenameArgs {
    PreviewTaskFilenameArgs {
        title: title.to_string(),
        explicit_filename: Some(filename.to_string()),
        parent_file_path: None,
    }
}

fn args_with_parent(title: &str, parent: &str) -> PreviewTaskFilenameArgs {
    PreviewTaskFilenameArgs {
        title: title.to_string(),
        explicit_filename: None,
        parent_file_path: Some(parent.to_string()),
    }
}

fn task_at(file_path: &str, parent: Option<&str>) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        draft: false,
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: parent.map(TaskFilePath::from_lenient),
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

// --- 正常系 ---

#[test]
fn title_only_produces_kebab_path() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with("Hello World"));
    match outcome {
        PreviewFilenameOutcome::Resolved {
            file_name,
            rel_path,
        } => {
            assert_eq!(file_name, "hello-world.md");
            assert_eq!(rel_path, Path::new("tasks/hello-world.md"));
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn explicit_filename_overrides_title() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome =
        index.plan_preview_filename(root, &args_with_explicit("My Title", "custom-name.md"));
    match outcome {
        PreviewFilenameOutcome::Resolved { file_name, .. } => {
            assert_eq!(file_name, "custom-name.md");
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn explicit_and_title_both_present() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(
        root,
        &args_with_explicit("Ignored Title", "explicit-file.md"),
    );
    match outcome {
        PreviewFilenameOutcome::Resolved { file_name, .. } => {
            assert_eq!(file_name, "explicit-file.md");
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn parent_resolves_target_dir() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_at("issues/82/parent.md", None)]);
    let outcome =
        index.plan_preview_filename(root, &args_with_parent("Child Task", "issues/82/parent.md"));
    match outcome {
        PreviewFilenameOutcome::Resolved { rel_path, .. } => {
            assert_eq!(rel_path, Path::new("issues/82/child-task.md"));
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

// --- 衝突回避 ---

#[test]
fn collision_appends_number() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_at("tasks/hello-world.md", None)]);
    let outcome = index.plan_preview_filename(root, &args_with("Hello World"));
    match outcome {
        PreviewFilenameOutcome::Resolved { file_name, .. } => {
            assert_eq!(file_name, "hello-world-1.md");
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn multiple_collisions_increment() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![
        task_at("tasks/hello-world.md", None),
        task_at("tasks/hello-world-1.md", None),
    ]);
    let outcome = index.plan_preview_filename(root, &args_with("Hello World"));
    match outcome {
        PreviewFilenameOutcome::Resolved { file_name, .. } => {
            assert_eq!(file_name, "hello-world-2.md");
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn multibyte_title_produces_valid_path() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with("タスク管理"));
    match outcome {
        PreviewFilenameOutcome::Resolved { rel_path, .. } => {
            assert!(rel_path.to_string_lossy().starts_with("tasks/"));
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

// --- 境界値 ---

#[test]
fn empty_title_returns_invalid() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with(""));
    assert!(matches!(outcome, PreviewFilenameOutcome::Invalid { .. }));
}

#[test]
fn symbols_only_title_returns_invalid() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with("!!!"));
    assert!(matches!(outcome, PreviewFilenameOutcome::Invalid { .. }));
}

#[test]
fn whitespace_only_title_returns_invalid() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with("   "));
    assert!(matches!(outcome, PreviewFilenameOutcome::Invalid { .. }));
}

#[test]
fn whitespace_only_explicit_treated_as_none() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with_explicit("Hello", "  "));
    match outcome {
        PreviewFilenameOutcome::Resolved { file_name, .. } => {
            assert_eq!(file_name, "hello.md");
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn very_long_title_produces_path() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let long_title = "a".repeat(250);
    let outcome = index.plan_preview_filename(root, &args_with(&long_title));
    assert!(matches!(outcome, PreviewFilenameOutcome::Resolved { .. }));
}

// --- 異常系 ---

#[test]
fn nonexistent_parent_returns_pending() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome =
        index.plan_preview_filename(root, &args_with_parent("Child", "tasks/nonexistent.md"));
    assert!(matches!(outcome, PreviewFilenameOutcome::Pending));
}

// --- エッジケース ---

#[test]
fn empty_parent_treated_as_no_parent() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with_parent("Hello", ""));
    match outcome {
        PreviewFilenameOutcome::Resolved { rel_path, .. } => {
            assert_eq!(rel_path, Path::new("tasks/hello.md"));
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}

#[test]
fn title_with_path_separators() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let outcome = index.plan_preview_filename(root, &args_with("path/to\\task"));
    match outcome {
        PreviewFilenameOutcome::Resolved { rel_path, .. } => {
            assert!(rel_path.to_string_lossy().starts_with("tasks/"));
        }
        other => panic!("expected Resolved, got {:?}", other),
    }
}
