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
fn plan_update_body_with_leading_newline_is_not_double_prefixed() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nold\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.body = Some("\nhello".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    // ---\n の直後に 1 行だけ空行が入り、その後 hello。\n\n が二重化しないこと。
    assert!(
        outcome.file_content.contains("---\n\nhello\n"),
        "leading newline must not be double-prefixed: {:?}",
        outcome.file_content
    );
    assert!(
        !outcome.file_content.contains("---\n\n\nhello"),
        "no triple-newline allowed"
    );
}

#[test]
fn plan_update_body_empty_string_clears_body_without_extra_newline() {
    let task = make_task("tasks/a.md", None);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nold body\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let mut intent = empty_intent("tasks/a.md");
    intent.body = Some(String::new());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ok");
    // Empty body は frontmatter 直下 `---\n` で終わる（余分な空行を残さない）。
    assert!(
        outcome.file_content.ends_with("---\n"),
        "empty body must not leave a trailing blank line: {:?}",
        outcome.file_content
    );
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

// `intent.parent = None` のとき、cache 側に独立循環があっても
// hierarchy 検証はスキップされ、`needs_full_rebuild=false` で返ること。
// `TaskIndex::new` は validation を走らせない契約を利用して
// 不正状態の cache を直接構築できる。
#[test]
fn plan_update_with_no_parent_change_skips_hierarchy_validation() {
    let tasks = vec![
        make_task("tasks/x.md", Some("tasks/y.md")),
        make_task("tasks/y.md", Some("tasks/x.md")),
        make_task("tasks/a.md", None),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.status = Some("Doing".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("validation should be skipped when parent is unchanged");
    assert!(
        !outcome.needs_full_rebuild,
        "parent unchanged → no full rebuild"
    );
}

// 既存 parent と正規化等価な値を渡しても `parent_changed=false` でスキップされ、
// cache 中の独立循環は検出されないこと（`plan_update_same_parent_with_dot_prefix_is_not_treated_as_change`
// との差分: 独立循環を含む cache でも結果が変わらないことの観測）。
#[test]
fn plan_update_normalized_equal_parent_skips_hierarchy_validation() {
    let tasks = vec![
        make_task("tasks/x.md", Some("tasks/y.md")),
        make_task("tasks/y.md", Some("tasks/x.md")),
        make_task("tasks/p.md", None),
        make_task("tasks/a.md", Some("tasks/p.md")),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("./tasks/p.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("normalized-equal parent must skip hierarchy validation");
    assert!(
        !outcome.needs_full_rebuild,
        "normalized-equal parent → no rebuild, independent cycle stays hidden"
    );
}

// 非祖先・非子孫 subtree への parent 接続が許可されること
// （chain A: c → b → a, chain B: y → x の root x を c に付け替え → 非循環）。
#[test]
fn plan_update_sibling_parent_change_is_allowed() {
    let tasks = vec![
        make_task("tasks/a.md", None),
        make_task("tasks/b.md", Some("tasks/a.md")),
        make_task("tasks/c.md", Some("tasks/b.md")),
        make_task("tasks/x.md", None),
        make_task("tasks/y.md", Some("tasks/x.md")),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/x.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: X\nstatus: Todo\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/x.md");
    intent.parent = Some("tasks/c.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("cross-subtree reparent must be allowed");
    assert!(outcome.needs_full_rebuild);
    assert!(outcome.file_content.contains("parent: tasks/c.md"));
}

// 親 b を一段飛ばして祖先 c に付け替えるケースが許可されること。
// patch 後: a.parent=c, b.parent=c, c.parent=None → 循環なし。
#[test]
fn plan_update_reparent_to_ancestor_is_allowed() {
    let tasks = vec![
        make_task("tasks/a.md", Some("tasks/b.md")),
        make_task("tasks/b.md", Some("tasks/c.md")),
        make_task("tasks/c.md", None),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/c.md".to_string());

    let outcome = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect("ancestor reparent (grandparent) must not be treated as cycle");
    assert!(outcome.needs_full_rebuild);
    assert!(outcome.file_content.contains("parent: tasks/c.md"));
}

// 親解除 (`Some("")`) でも `parent_changed=true` のとき hierarchy 検証が全タスクを走り、
// 独立循環が検出されることを Err 期待で観測する
// （既存 `plan_update_parent_cleared_with_empty_string_returns_needs_full_rebuild` は
// 循環なし cache で `needs_full_rebuild=true` を確認するのみ）。
#[test]
fn plan_update_parent_removal_to_empty_string_triggers_hierarchy_validation() {
    let tasks = vec![
        make_task("tasks/x.md", Some("tasks/y.md")),
        make_task("tasks/y.md", Some("tasks/x.md")),
        make_task("tasks/a.md", Some("tasks/b.md")),
        make_task("tasks/b.md", None),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some(String::new());

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("parent removal must trigger validation that surfaces existing cycle");
    match err {
        UpdateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(Cycle), got {other:?}"),
    }
}

// parent 変更がトリガーで全タスク再検証が走り、関係ない独立循環も検出されること
// （副次的検出の挙動を固定化）。
#[test]
fn plan_update_detects_independent_cycle_in_cache_when_parent_changes() {
    let tasks = vec![
        make_task("tasks/x.md", Some("tasks/y.md")),
        make_task("tasks/y.md", Some("tasks/x.md")),
        make_task("tasks/a.md", None),
        make_task("tasks/b.md", None),
    ];
    let task = tasks
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap()
        .clone();
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(tasks);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/b.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task, parsed)
        .expect_err("independent cycle should be surfaced when parent changes");
    match err {
        UpdateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(Cycle), got {other:?}"),
    }
}

// 中継ノード 1 段を挟む 3 段循環が検出されること
// （既存 `plan_update_descendant_parent_returns_parent_cycle` は 2 段循環）。
// 既存: a.parent=None, b.parent=a, c.parent=b
// intent: a.parent = c.md → a → c → b → a の 3 段循環
#[test]
fn plan_update_three_node_descendant_cycle_returns_parent_cycle() {
    let task_a = make_task("tasks/a.md", None);
    let task_b = make_task("tasks/b.md", Some("tasks/a.md"));
    let task_c = make_task("tasks/c.md", Some("tasks/b.md"));
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task_a.clone(), task_b, task_c]);

    let mut intent = empty_intent("tasks/a.md");
    intent.parent = Some("tasks/c.md".to_string());

    let err = index
        .plan_update(project_root(), intent, &task_a, parsed)
        .expect_err("3-node descendant cycle must be detected");
    match err {
        UpdateTaskError::ParentCycleOrTooDeep { reason, .. } => {
            assert_eq!(ParentHierarchyErrorReason::Cycle, reason);
        }
        other => panic!("expected ParentCycleOrTooDeep(Cycle), got {other:?}"),
    }
}
