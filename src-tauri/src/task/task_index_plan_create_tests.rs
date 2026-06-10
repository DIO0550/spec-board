//! `TaskIndex::plan_create` の純粋関数ユニットテスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::path::Path;

use super::{CreateTaskIntent, ParentHierarchyErrorReason, Task, TaskIndex};
use crate::config::column_name::ColumnName;
use crate::task::create::error::{ContentRejectReason, CreateTaskError};
use crate::task::frontmatter::Priority;
use crate::task::label::Label;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;

fn intent_with(title: &str, parent: Option<&str>) -> CreateTaskIntent {
    CreateTaskIntent {
        file_name: None,
        title: TaskTitle::from_lenient(title.to_string()),
        status: ColumnName::from_lenient("Todo".to_string()),
        priority: None,
        milestone: None,
        labels: Vec::<Label>::new(),
        parent: parent.map(TaskFilePath::from_lenient),
        links: Vec::new(),
        body: None,
    }
}

fn task_with(file_path: &str, parent: Option<&str>) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
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

#[test]
fn places_under_tasks_when_no_parent() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with("Hello World", None);

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    assert_eq!(
        Path::new("tasks/hello-world.md"),
        outcome.rel_path.as_path()
    );
    assert_eq!(root.join("tasks/hello-world.md"), outcome.abs_path);
    assert_eq!(root.join("tasks"), outcome.target_dir_abs);
    assert_eq!(ColumnName::from_lenient("Todo".to_string()), outcome.status);
}

#[test]
fn places_under_parent_dir_when_parent_specified() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_with("issues/82/parent.md", None)]);
    let intent = intent_with("Child Task", Some("issues/82/parent.md"));

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    assert_eq!(
        Path::new("issues/82/child-task.md"),
        outcome.rel_path.as_path()
    );
}

#[test]
fn places_under_project_root_when_parent_is_root_level() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_with("root-parent.md", None)]);
    let intent = intent_with("Child", Some("root-parent.md"));

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    // parent が root 直下なので子も root 直下
    assert_eq!(Path::new("child.md"), outcome.rel_path.as_path());
    assert_eq!(root.join("child.md"), outcome.abs_path);
}

#[test]
fn appends_suffix_on_filename_collision() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_with("tasks/foo.md", None)]);
    let intent = intent_with("Foo", None);

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    assert_eq!(Path::new("tasks/foo-1.md"), outcome.rel_path.as_path());
}

#[test]
fn returns_parent_not_found_when_parent_missing() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with("Orphan", Some("tasks/missing.md"));

    let err = index.plan_create(root, &intent).expect_err("should fail");
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
    // 既存: a (parent=new.md) + B0..B19 chain. new(parent=B0) で 21 段になり TooDeep
    let mut snapshot = vec![task_with("tasks/a.md", Some("tasks/new.md"))];
    for i in 0..19 {
        snapshot.push(task_with(
            &format!("tasks/B{i}.md"),
            Some(&format!("tasks/B{}.md", i + 1)),
        ));
    }
    snapshot.push(task_with("tasks/B19.md", None));

    let index = TaskIndex::new(snapshot);
    let intent = intent_with("New", Some("tasks/B0.md"));

    let err = index.plan_create(root, &intent).expect_err("should fail");
    match err {
        CreateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::TooDeep, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(TooDeep), got {other:?}"),
    }
}

#[test]
fn returns_cycle_when_dangling_parent_resolves_to_cycle() {
    let root = Path::new("/project");
    // 既存 a.parent = new.md → new.parent = a にすると循環
    let index = TaskIndex::new(vec![task_with("tasks/a.md", Some("tasks/new.md"))]);
    let intent = intent_with("New", Some("tasks/a.md"));

    let err = index.plan_create(root, &intent).expect_err("should fail");
    assert!(matches!(err, CreateTaskError::ParentCycleOrTooDeep { .. }));
}

#[test]
fn returns_invalid_title_for_empty_title() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with("", None);

    let err = index.plan_create(root, &intent).expect_err("should fail");
    assert!(matches!(err, CreateTaskError::InvalidTitle));
}

#[test]
fn returns_invalid_title_for_symbols_only_title() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with("!!! ???", None);

    let err = index.plan_create(root, &intent).expect_err("should fail");
    assert!(matches!(err, CreateTaskError::InvalidTitle));
}

#[test]
fn returns_content_too_large_when_body_exceeds_scanner_limit() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let mut intent = intent_with("Big", None);
    intent.body = Some("a".repeat(1024 * 1024 + 1));

    let err = index.plan_create(root, &intent).expect_err("should fail");
    match err {
        CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        } => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
}

#[test]
fn intent_with_priority_and_labels_renders_into_content() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = CreateTaskIntent {
        file_name: None,
        title: TaskTitle::from_lenient("Implement Feature".to_string()),
        status: ColumnName::from_lenient("Doing".to_string()),
        priority: Priority::from_ascii_ci("high"),
        milestone: None,
        labels: vec![Label::from("bug"), Label::from("api")],
        parent: None,
        links: Vec::new(),
        body: Some("Detailed description.".to_string()),
    };

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    assert!(s.contains("priority: High"));
    assert!(s.contains("- bug"));
    assert!(s.contains("- api"));
    assert!(s.contains("Detailed description."));
}

// ---------------------------------------------------------------------------
// links の lenient 正規化（dedup / パス正規化 / lenient 保持）
// ---------------------------------------------------------------------------

fn intent_with_links(title: &str, parent: Option<&str>, links: Vec<&str>) -> CreateTaskIntent {
    CreateTaskIntent {
        file_name: None,
        title: TaskTitle::from_lenient(title.to_string()),
        status: ColumnName::from_lenient("Todo".to_string()),
        priority: None,
        milestone: None,
        labels: Vec::<Label>::new(),
        parent: parent.map(TaskFilePath::from_lenient),
        links: links.into_iter().map(|s| s.to_string()).collect(),
        body: None,
    }
}

#[test]
fn normalizes_single_link_into_content() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["tasks/a.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    assert!(s.contains("links:"));
    assert!(s.contains("- tasks/a.md"));
}

#[test]
fn preserves_order_of_multiple_links() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["tasks/a.md", "tasks/b.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    let a = s.find("- tasks/a.md").expect("a present");
    let b = s.find("- tasks/b.md").expect("b present");
    assert!(a < b, "input order must be preserved");
}

#[test]
fn omits_links_key_when_empty() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec![]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    assert!(!outcome.content.as_str().contains("links:"));
}

#[test]
fn dedups_duplicate_links() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["tasks/a.md", "tasks/a.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    assert_eq!(s.matches("- tasks/a.md").count(), 1, "should dedup to 1");
}

#[test]
fn dedups_links_after_path_normalization() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["./tasks/a.md", "tasks/a.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    assert_eq!(
        s.matches("- tasks/a.md").count(),
        1,
        "normalized forms must converge and dedup"
    );
}

#[test]
fn excludes_absolute_and_drive_prefix_links() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["/abs/x.md", "C:\\x.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    assert!(
        !outcome.content.as_str().contains("links:"),
        "absolute / drive-prefix paths are excluded, leaving no links"
    );
}

#[test]
fn keeps_link_same_as_parent_path_leniently() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_with("tasks/p.md", None)]);
    let intent = intent_with_links("Child", Some("tasks/p.md"), vec!["tasks/p.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    let s = outcome.content.as_str();
    // parent と同一パスでも reject せず links に保持する（除外は FE ピッカーの責務）。
    assert!(s.contains("parent: tasks/p.md"));
    assert!(s.contains("- tasks/p.md"));
}

#[test]
fn keeps_nonexistent_link_leniently() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["tasks/ghost.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    assert!(outcome.content.as_str().contains("- tasks/ghost.md"));
}

#[test]
fn keeps_parent_traversal_link_leniently() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_links("A", None, vec!["../outside.md"]);

    let outcome = index.plan_create(root, &intent).expect("should succeed");
    // normalize_path_parts は `..` を保持するため dangling として残る。
    assert!(outcome.content.as_str().contains("../outside.md"));
}

fn intent_with_file_name(title: &str, parent: Option<&str>, file_name: &str) -> CreateTaskIntent {
    CreateTaskIntent {
        file_name: Some(file_name.to_string()),
        ..intent_with(title, parent)
    }
}

#[test]
fn uses_explicit_file_name_when_specified() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with_file_name("Hello World", None, "custom-name.md");

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    assert_eq!(
        Path::new("tasks/custom-name.md"),
        outcome.rel_path.as_path()
    );
}

#[test]
fn appends_suffix_when_explicit_file_name_collides() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![task_with("tasks/custom-name.md", None)]);
    let intent = intent_with_file_name("Hello", None, "custom-name.md");

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    assert_eq!(
        Path::new("tasks/custom-name-1.md"),
        outcome.rel_path.as_path()
    );
}

#[test]
fn resolves_explicit_file_name_collision_within_parent_dir() {
    let root = Path::new("/project");
    let index = TaskIndex::new(vec![
        task_with("issues/82/parent.md", None),
        task_with("issues/82/custom.md", None),
    ]);
    let intent = intent_with_file_name("Child", Some("issues/82/parent.md"), "custom.md");

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    // 親 dir 配下の既存ファイル名と照合して連番判定される。
    assert_eq!(
        Path::new("issues/82/custom-1.md"),
        outcome.rel_path.as_path()
    );
}

#[test]
fn rejects_invalid_explicit_file_names() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let cases = ["a/b.md", "x.txt", ""];
    for value in cases {
        let intent = intent_with_file_name("Hello", None, value);
        let err = index.plan_create(root, &intent).expect_err("should fail");
        assert!(
            matches!(err, CreateTaskError::InvalidFileName(_)),
            "plan_create(file_name={value:?}) は InvalidFileName になるべき (got {err:?})"
        );
    }
}

#[test]
fn keeps_title_based_generation_when_file_name_absent() {
    let root = Path::new("/project");
    let index = TaskIndex::new(Vec::new());
    let intent = intent_with("Hello World", None);

    let outcome = index.plan_create(root, &intent).expect("should succeed");

    // file_name 未指定はタイトル由来生成（リグレッション確認）。
    assert_eq!(
        Path::new("tasks/hello-world.md"),
        outcome.rel_path.as_path()
    );
}
