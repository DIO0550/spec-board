use super::{TaskContent, TaskContentError};
use crate::task::create::error::{ContentRejectReason, CreateTaskError};
use crate::task::task_index::CreateTaskIntent;

#[test]
fn try_new_accepts_content_at_max_file_size_boundary() {
    let max = 1024 * 1024;
    let content = "a".repeat(max);
    let vo = TaskContent::try_new(content).expect("max boundary should succeed");
    assert_eq!(vo.as_bytes().len(), max);
}

#[test]
fn try_new_rejects_content_one_byte_over_max() {
    let too_large = "a".repeat(1024 * 1024 + 1);
    let err = TaskContent::try_new(too_large).expect_err("should fail");
    assert!(matches!(
        err,
        TaskContentError::TooLarge {
            size: 1048577,
            limit: 1048576,
        }
    ));
}

#[test]
fn try_new_rejects_content_with_nul_byte_in_first_8kib() {
    let mut content = String::from("hello");
    content.push('\u{0000}');
    content.push_str("world");
    let err = TaskContent::try_new(content).expect_err("should fail");
    assert!(matches!(
        err,
        TaskContentError::BinaryDetected { probe: 8192 }
    ));
}

#[test]
fn try_new_accepts_nul_byte_beyond_first_8kib() {
    let mut content = "a".repeat(8 * 1024);
    content.push('\u{0000}');
    let vo = TaskContent::try_new(content).expect("nul beyond probe should succeed");
    assert_eq!(vo.as_bytes().len(), 8 * 1024 + 1);
}

#[test]
fn as_str_and_into_string_return_original_content() {
    let raw = String::from("---\ntitle: Foo\nstatus: Todo\n---\n");
    let vo = TaskContent::try_new(raw.clone()).expect("valid");
    assert_eq!(vo.as_str(), &raw);
    assert_eq!(vo.into_string(), raw);
}

// ---------------------------------------------------------------------------
// TaskContent::from_intent — frontmatter + body 組み立て
// ---------------------------------------------------------------------------

fn intent_with(
    title: &str,
    status: &str,
    priority: Option<&str>,
    labels: Vec<&str>,
    parent: Option<&str>,
    body: Option<&str>,
) -> CreateTaskIntent {
    use crate::config::column_name::ColumnName;
    use crate::task::frontmatter::Priority;
    use crate::task::label::Label;
    use crate::task::task_file_path::TaskFilePath;
    use crate::task::task_title::TaskTitle;
    CreateTaskIntent {
        title: TaskTitle::from_lenient(title.to_string()),
        status: ColumnName::from_lenient(status.to_string()),
        priority: priority.and_then(Priority::from_ascii_ci),
        labels: labels.into_iter().map(Label::from).collect(),
        parent: parent.map(TaskFilePath::from_lenient),
        body: body.map(|s| s.to_string()),
    }
}

#[test]
fn from_intent_renders_title_and_status_in_fixed_order() {
    let intent = intent_with("Foo Bar", "Todo", None, vec![], None, None);
    let content = TaskContent::from_intent(&intent, None).expect("valid");
    let s = content.as_str();
    assert!(s.starts_with("---\ntitle: Foo Bar\nstatus: Todo\n"));
    assert!(!s.contains("priority:"));
    assert!(!s.contains("labels:"));
    assert!(!s.contains("parent:"));
}

#[test]
fn from_intent_normalizes_priority_case_insensitively() {
    let cases: Vec<(&str, &str)> = vec![("high", "High"), ("HIGH", "High"), ("MeDiUm", "Medium")];
    for (input, expected) in cases {
        let intent = intent_with("T", "Todo", Some(input), vec![], None, None);
        let content = TaskContent::from_intent(&intent, None).expect("valid");
        let s = content.as_str();
        assert!(
            s.contains(&format!("priority: {expected}")),
            "priority {input} → {expected} expected, got:\n{s}"
        );
    }
}

#[test]
fn from_intent_omits_priority_for_invalid_string() {
    let intent = intent_with("T", "Todo", Some("urgent"), vec![], None, None);
    let content = TaskContent::from_intent(&intent, None).expect("valid");
    let s = content.as_str();
    assert!(
        !s.contains("priority:"),
        "invalid priority should be omitted, got:\n{s}"
    );
}

#[test]
fn from_intent_renders_labels_and_parent_and_body() {
    let intent = intent_with(
        "T",
        "Todo",
        Some("High"),
        vec!["bug", "api"],
        Some("tasks/p.md"),
        Some("hello body"),
    );
    let content = TaskContent::from_intent(&intent, Some("tasks/p.md")).expect("valid");
    let s = content.as_str();
    assert!(s.contains("title: T"));
    assert!(s.contains("status: Todo"));
    assert!(s.contains("priority: High"));
    assert!(s.contains("labels:"));
    assert!(s.contains("- bug"));
    assert!(s.contains("- api"));
    assert!(s.contains("parent: tasks/p.md"));
    assert!(s.ends_with("hello body\n"), "body trailing:\n{s}");
}

#[test]
fn from_intent_rejects_body_larger_than_scanner_max_size() {
    let huge = "a".repeat(1024 * 1024 + 1);
    let intent = intent_with("Huge", "Todo", None, vec![], None, Some(&huge));
    let err = TaskContent::from_intent(&intent, None).expect_err("should fail");
    assert!(matches!(
        err,
        CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        }
    ));
}

#[test]
fn from_intent_rejects_body_with_nul_byte_in_first_8kb() {
    let mut bad_body = String::from("hello");
    bad_body.push('\u{0000}');
    bad_body.push_str("world");
    let intent = intent_with("Nul", "Todo", None, vec![], None, Some(&bad_body));
    let err = TaskContent::from_intent(&intent, None).expect_err("should fail");
    assert!(matches!(
        err,
        CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        }
    ));
}
