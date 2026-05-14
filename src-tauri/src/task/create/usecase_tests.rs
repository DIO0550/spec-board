//! `create_task_usecase` の純粋関数テスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::path::Path;

use super::super::args::CreateTaskArgs;
use super::super::error::{ContentRejectReason, CreateTaskError};
use super::create_task_usecase;
use crate::task::task_index::{ParentHierarchyErrorReason, Task};

fn args_with_title(title: &str) -> CreateTaskArgs {
    CreateTaskArgs {
        title: title.into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: None,
        body: None,
    }
}

fn task_with(file_path: &str, parent: Option<&str>) -> Task {
    use crate::task::task_file_path::TaskFilePath;
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: parent.map(TaskFilePath::from_lenient),
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

#[test]
fn places_under_tasks_when_no_parent() {
    let root = Path::new("/project");
    let outcome = create_task_usecase(Vec::new(), root, &args_with_title("Hello World"))
        .expect("should succeed");
    assert_eq!(
        Path::new("tasks/hello-world.md"),
        outcome.rel_path.as_path()
    );
    assert_eq!(root.join("tasks/hello-world.md"), outcome.abs_path);
    assert_eq!(root.join("tasks"), outcome.target_dir_abs);
    assert_eq!("Todo", outcome.status);
}

#[test]
fn places_under_parent_dir_when_parent_specified() {
    let root = Path::new("/project");
    let snapshot = vec![task_with("issues/82/parent.md", None)];
    let mut args = args_with_title("Child Task");
    args.parent = Some("issues/82/parent.md".into());

    let outcome = create_task_usecase(snapshot, root, &args).expect("should succeed");

    assert_eq!(
        Path::new("issues/82/child-task.md"),
        outcome.rel_path.as_path()
    );
}

#[test]
fn places_under_project_root_when_parent_is_in_root_dir() {
    let root = Path::new("/project");
    let snapshot = vec![task_with("root-parent.md", None)];
    let mut args = args_with_title("Child");
    args.parent = Some("root-parent.md".into());

    let outcome = create_task_usecase(snapshot, root, &args).expect("should succeed");

    // parent が root 直下なので子も root 直下に置かれる
    assert_eq!(Path::new("child.md"), outcome.rel_path.as_path());
    assert_eq!(root.join("child.md"), outcome.abs_path);
}

#[test]
fn appends_suffix_on_filename_collision() {
    let root = Path::new("/project");
    let snapshot = vec![task_with("tasks/foo.md", None)];

    let outcome =
        create_task_usecase(snapshot, root, &args_with_title("Foo")).expect("should succeed");
    assert_eq!(Path::new("tasks/foo-1.md"), outcome.rel_path.as_path());
}

#[test]
fn returns_parent_not_found_when_parent_missing() {
    let root = Path::new("/project");
    let mut args = args_with_title("Orphan");
    args.parent = Some("tasks/missing.md".into());

    let err = create_task_usecase(Vec::new(), root, &args).expect_err("should fail");
    match err {
        CreateTaskError::ParentNotFound { parent } => {
            assert_eq!("tasks/missing.md", parent);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
}

#[test]
fn returns_too_deep_when_augmented_chain_exceeds_limit() {
    let root = Path::new("/project");
    // 既存 chain: a.md(parent=new.md) + B0(parent=B1) ... B18(parent=B19) + B19(no parent)
    // 新規 new.md(parent=B0) を加えると a → new → B0 → … → B19 で深さ超過。
    let mut snapshot = Vec::new();
    snapshot.push(task_with("tasks/a.md", Some("tasks/new.md")));
    for i in 0..19 {
        snapshot.push(task_with(
            &format!("tasks/B{i}.md"),
            Some(&format!("tasks/B{}.md", i + 1)),
        ));
    }
    snapshot.push(task_with("tasks/B19.md", None));

    let mut args = args_with_title("New");
    args.parent = Some("tasks/B0.md".into());

    let err = create_task_usecase(snapshot, root, &args).expect_err("should fail");
    match err {
        CreateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::TooDeep, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(TooDeep), got {other:?}"),
    }
}

#[test]
fn returns_cycle_when_augmented_dangling_parent_resolves_to_cycle() {
    let root = Path::new("/project");
    // 既存 a の parent が「新タスク」のパスを指している → 新タスクの parent を a にすると循環
    let snapshot = vec![task_with("tasks/a.md", Some("tasks/new.md"))];

    let mut args = args_with_title("New");
    args.parent = Some("tasks/a.md".into());

    let err = create_task_usecase(snapshot, root, &args).expect_err("should fail");
    assert!(matches!(err, CreateTaskError::ParentCycleOrTooDeep { .. }));
}

#[test]
fn returns_invalid_title_for_empty_title() {
    let root = Path::new("/project");
    let err = create_task_usecase(Vec::new(), root, &args_with_title("")).expect_err("should fail");
    assert!(matches!(err, CreateTaskError::InvalidTitle));
}

#[test]
fn returns_invalid_title_for_symbols_only_title() {
    let root = Path::new("/project");
    let err = create_task_usecase(Vec::new(), root, &args_with_title("!!! ???"))
        .expect_err("should fail");
    assert!(matches!(err, CreateTaskError::InvalidTitle));
}

#[test]
fn returns_content_too_large_when_body_exceeds_scanner_limit() {
    let root = Path::new("/project");
    let mut args = args_with_title("Big");
    args.body = Some("a".repeat(1024 * 1024 + 1));

    let err = create_task_usecase(Vec::new(), root, &args).expect_err("should fail");
    match err {
        CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        } => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
}
