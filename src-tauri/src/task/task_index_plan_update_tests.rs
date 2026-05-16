//! `TaskIndex::plan_update` の純粋関数ユニットテスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use super::{ParentHierarchyErrorReason, Task, TaskIndex, UpdateTaskIntent};
use crate::config::column_name::ColumnName;
use crate::task::create::error::ContentRejectReason;
use crate::task::frontmatter::{parse as parse_frontmatter, Parsed, Priority};
use crate::task::parse::TaskParseError;
use crate::task::task_content::TaskContentError;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::ParentValidationFailure;
use crate::task::update::error::UpdateTaskError;
use crate::task::warning::TaskWarningCode;

fn make_task(file_path: &str, parent: Option<&str>) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: ColumnName::from_lenient("Todo"),
        priority: None,
        labels: Vec::new(),
        parent: parent.map(TaskFilePath::from_lenient),
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: BTreeMap::new(),
        warnings: Vec::new(),
    }
}

fn parsed_from_md(md: &str) -> Parsed {
    parse_frontmatter(md).expect("parse ok").expect("some")
}

fn empty_intent(rel: &str) -> UpdateTaskIntent {
    UpdateTaskIntent {
        file_path: PathBuf::from(rel),
        title: None,
        status: None,
        priority: None,
        labels: None,
        parent: None,
        body: None,
    }
}

fn project_root() -> &'static Path {
    Path::new("/project")
}

#[test]
fn plan_update_status_only_changes_status_line_only() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.status = Some("Doing".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("status: Doing"));
    assert!(outcome.file_content.contains("title: A"));
    assert!(!outcome.needs_full_rebuild);
    assert_eq!(outcome.updated_task.status.as_str(), "Doing");
}

#[test]
fn plan_update_priority_only_replaces_typed_priority() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\npriority: High\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.priority = Some(Priority::Medium);

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("priority: Medium"));
    assert!(!outcome.file_content.contains("priority: High"));
}

#[test]
fn plan_update_labels_empty_list_clears_labels() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nlabels:\n  - bug\n  - api\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.labels = Some(Vec::new());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(!outcome.file_content.contains("- bug"));
    assert!(!outcome.file_content.contains("labels:"));
}

#[test]
fn plan_update_body_only_replaces_body() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nold body\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.body = Some("new body".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("new body"));
    assert!(!outcome.file_content.contains("old body"));
}

#[test]
fn plan_update_title_changes_frontmatter_title_only_file_path_unchanged() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: Old\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("New Title".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("title: New Title"));
    assert_eq!(outcome.updated_task.file_path, "tasks/a.md");
    assert!(!outcome.needs_full_rebuild);
}

#[test]
fn plan_update_empty_title_re_runs_parser_and_emits_invalid_title_warning() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: Old\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some(String::new());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    let has_warning = outcome
        .updated_task
        .warnings
        .iter()
        .any(|w| w.code == TaskWarningCode::InvalidTitleUsedFileName);
    assert!(
        has_warning,
        "expected invalidTitleUsedFileName warning, got {:?}",
        outcome.updated_task.warnings
    );
}

#[test]
fn plan_update_preserves_unknown_keys_in_extras() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nassignee: alice\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("Updated".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(
        outcome.file_content.contains("assignee: alice"),
        "unknown key should be preserved: {}",
        outcome.file_content
    );
}

#[test]
fn plan_update_preserves_links_array() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n  - tasks/c.md\n---\n",
    );
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("Updated".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("tasks/b.md"));
    assert!(outcome.file_content.contains("tasks/c.md"));
}

#[test]
fn plan_update_preserves_numeric_unknown_key() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\npriority_score: 42\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("Updated".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("priority_score: 42"));
}

#[test]
fn plan_update_preserves_boolean_unknown_key() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\narchived: true\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("Updated".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.file_content.contains("archived: true"));
}

#[test]
fn plan_update_with_no_parent_change_returns_no_rebuild_flag() {
    let task = make_task("tasks/a.md", Some("tasks/p.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(!outcome.needs_full_rebuild);
}

#[test]
fn plan_update_same_parent_with_dot_prefix_is_not_treated_as_change() {
    // 既存 parent="tasks/p.md" の task に、./tasks/p.md（同一 task を指す表記揺れ）
    // を渡しても needs_full_rebuild=false を返すこと。
    let task = make_task("tasks/a.md", Some("tasks/p.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("./tasks/p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    assert!(
        !outcome.needs_full_rebuild,
        "lexically equivalent parent should not trigger rebuild"
    );
}

#[test]
fn plan_update_same_parent_with_backslash_separator_is_not_treated_as_change() {
    let task = make_task("tasks/a.md", Some("tasks/p.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks\\p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    assert!(
        !outcome.needs_full_rebuild,
        "backslash separator pointing to same task should not trigger rebuild"
    );
}

#[test]
fn plan_update_parent_added_returns_needs_full_rebuild() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.needs_full_rebuild);
    assert!(outcome.file_content.contains("parent: tasks/p.md"));
}

#[test]
fn plan_update_parent_cleared_with_empty_string_returns_needs_full_rebuild() {
    let task = make_task("tasks/a.md", Some("tasks/p.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some(String::new());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert!(outcome.needs_full_rebuild);
    assert!(!outcome.file_content.contains("parent:"));
}

#[test]
fn plan_update_returns_parent_not_found_for_missing_parent() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/missing.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("fail");

    match err {
        UpdateTaskError::ParentNotFound { path } => {
            assert_eq!("tasks/missing.md", path);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
}

#[test]
fn plan_update_resolves_parent_with_dot_prefix_via_normalization() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("./tasks/p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    assert!(outcome.needs_full_rebuild);
}

#[test]
fn plan_update_resolves_parent_with_backslash_separator_via_normalization() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/p.md", None)]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks\\p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    assert!(outcome.needs_full_rebuild);
}

#[test]
fn plan_update_self_reference_returns_parent_cycle() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/a.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("fail");
    match err {
        UpdateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
}

#[test]
fn plan_update_descendant_parent_returns_parent_cycle() {
    let task_a = make_task("tasks/a.md", None);
    let task_b = make_task("tasks/b.md", Some("tasks/a.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task_a.clone(), task_b]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/b.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task_a, parsed)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::ParentCycleOrTooDeep { .. }));
}

#[test]
fn plan_update_chain_too_deep_returns_parent_too_deep() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");

    // a (no parent) + B0..B20 chain (B0.parent=B1, ..., B19.parent=B20, B20=None)
    // After setting a.parent = B0, chain becomes a → B0 → ... → B20 (22 nodes / 21 edges)
    // depth reaches 21 which exceeds MAX_PARENT_DEPTH (20) → TooDeep.
    let mut tasks = vec![task.clone()];
    for i in 0..20 {
        tasks.push(make_task(
            &format!("tasks/B{i}.md"),
            Some(&format!("tasks/B{}.md", i + 1)),
        ));
    }
    tasks.push(make_task("tasks/B20.md", None));
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/B0.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("fail");
    match err {
        UpdateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::TooDeep, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(TooDeep), got {other:?}"),
    }
}

#[test]
fn plan_update_body_over_1mib_returns_content_too_large() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.body = Some("a".repeat(1024 * 1024 + 1));

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("fail");
    match err {
        UpdateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        } => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
}

#[test]
fn plan_update_body_with_nul_byte_returns_binary_detected() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    let mut body = String::from("hello");
    body.push('\u{0000}');
    body.push_str("world");
    intent.body = Some(body);

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("fail");
    match err {
        UpdateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        } => {}
        other => panic!("expected ContentNotScannerEligible(BinaryDetected), got {other:?}"),
    }
}

#[test]
fn from_task_parse_error_cycle_maps_to_parent_cycle() {
    let err = TaskParseError::CycleOrTooDeep {
        file_path: "tasks/a.md".to_string(),
        reason: ParentHierarchyErrorReason::Cycle,
    };
    let mapped: UpdateTaskError = err.into();
    match mapped {
        UpdateTaskError::ParentCycleOrTooDeep { file_path, reason } => {
            assert_eq!("tasks/a.md", file_path);
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
}

#[test]
fn from_task_parse_error_not_task_maps_to_parse_failed() {
    let mapped: UpdateTaskError = TaskParseError::NotTask.into();
    match mapped {
        UpdateTaskError::ParseFailed(msg) => {
            assert!(msg.contains("no frontmatter"), "msg={msg}");
        }
        other => panic!("expected ParseFailed, got {other:?}"),
    }
}

#[test]
fn from_task_content_error_too_large_maps_to_content_not_scanner_eligible() {
    let err = TaskContentError::TooLarge {
        size: 9999,
        limit: 1024,
    };
    let mapped: UpdateTaskError = err.into();
    match mapped {
        UpdateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { size },
        } => {
            assert_eq!(9999, size);
        }
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
}

#[test]
fn from_task_content_error_binary_detected_maps_to_content_not_scanner_eligible() {
    let err = TaskContentError::BinaryDetected { probe: 8192 };
    let mapped: UpdateTaskError = err.into();
    match mapped {
        UpdateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        } => {}
        other => panic!("expected ContentNotScannerEligible(BinaryDetected), got {other:?}"),
    }
}

#[test]
fn from_parent_validation_failure_not_found_maps_to_parent_not_found() {
    let err = ParentValidationFailure::NotFound {
        parent: "tasks/missing.md".to_string(),
    };
    let mapped: UpdateTaskError = err.into();
    match mapped {
        UpdateTaskError::ParentNotFound { path } => {
            assert_eq!("tasks/missing.md", path);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
}

#[test]
fn from_parent_validation_failure_chain_invalid_maps_to_parent_cycle() {
    let err = ParentValidationFailure::ChainInvalid {
        parent: "tasks/a.md".to_string(),
        reason: ParentHierarchyErrorReason::Cycle,
    };
    let mapped: UpdateTaskError = err.into();
    match mapped {
        UpdateTaskError::ParentCycleOrTooDeep { file_path, reason } => {
            assert_eq!("tasks/a.md", file_path);
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
}

#[test]
fn plan_update_returns_root_relative_file_path_in_updated_task() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.title = Some("New".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");

    assert_eq!(outcome.updated_task.file_path, "tasks/a.md");
}
