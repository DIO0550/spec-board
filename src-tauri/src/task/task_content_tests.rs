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
        file_name: None,
        title: TaskTitle::from_lenient(title.to_string()),
        status: ColumnName::from_lenient(status.to_string()),
        priority: priority.and_then(Priority::from_ascii_ci),
        milestone: None,
        labels: labels.into_iter().map(Label::from).collect(),
        parent: parent.map(TaskFilePath::from_lenient),
        links: Vec::new(),
        body: body.map(|s| s.to_string()),
    }
}

#[test]
fn from_intent_renders_title_and_status_in_fixed_order() {
    let intent = intent_with("Foo Bar", "Todo", None, vec![], None, None);
    let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
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
        let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
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
    let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
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
    let content = TaskContent::from_intent(&intent, Some("tasks/p.md"), &[]).expect("valid");
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
fn from_intent_renders_milestone_in_sl002_order() {
    use crate::config::column_name::ColumnName;
    use crate::task::label::Label;
    use crate::task::task_title::TaskTitle;

    let intent = CreateTaskIntent {
        file_name: None,
        title: TaskTitle::from_lenient("T".to_string()),
        status: ColumnName::from_lenient("Todo".to_string()),
        priority: None,
        milestone: Some("v0.3".to_string()),
        labels: vec![Label::from("bug")],
        parent: None,
        links: Vec::new(),
        body: None,
    };
    let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
    let s = content.as_str();
    assert!(
        s.contains("milestone: v0.3"),
        "milestone line expected:\n{s}"
    );
    // labels の後・parent（なし）の前。labels 行 → milestone 行の順序を確認。
    let labels_pos = s.find("labels:").expect("labels present");
    let milestone_pos = s.find("milestone:").expect("milestone present");
    assert!(
        labels_pos < milestone_pos,
        "labels should precede milestone:\n{s}"
    );
}

#[test]
fn from_intent_omits_milestone_when_empty_or_unspecified() {
    use crate::config::column_name::ColumnName;
    use crate::task::task_title::TaskTitle;

    for milestone in [None, Some(String::new())] {
        let intent = CreateTaskIntent {
            file_name: None,
            title: TaskTitle::from_lenient("T".to_string()),
            status: ColumnName::from_lenient("Todo".to_string()),
            priority: None,
            milestone,
            labels: Vec::new(),
            parent: None,
            links: Vec::new(),
            body: None,
        };
        let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
        assert!(
            !content.as_str().contains("milestone:"),
            "milestone line should be omitted:\n{}",
            content.as_str()
        );
    }
}

#[test]
fn from_intent_rejects_body_larger_than_scanner_max_size() {
    let huge = "a".repeat(1024 * 1024 + 1);
    let intent = intent_with("Huge", "Todo", None, vec![], None, Some(&huge));
    let err = TaskContent::from_intent(&intent, None, &[]).expect_err("should fail");
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
    let err = TaskContent::from_intent(&intent, None, &[]).expect_err("should fail");
    assert!(matches!(
        err,
        CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        }
    ));
}

// ---------------------------------------------------------------------------
// from_intent — links 出力（フィールド順 / 空キー省略 / 複数件）
// ---------------------------------------------------------------------------

#[test]
fn from_intent_renders_normalized_links() {
    let intent = intent_with("T", "Todo", None, vec![], None, None);
    let content =
        TaskContent::from_intent(&intent, None, &["tasks/a.md".to_string()]).expect("valid");
    let s = content.as_str();
    assert!(s.contains("links:"));
    assert!(s.contains("- tasks/a.md"));
}

#[test]
fn from_intent_renders_links_in_fixed_field_order() {
    let intent = intent_with(
        "T",
        "Todo",
        Some("High"),
        vec!["bug"],
        Some("tasks/p.md"),
        None,
    );
    let content =
        TaskContent::from_intent(&intent, Some("tasks/p.md"), &["tasks/a.md".to_string()])
            .expect("valid");
    let s = content.as_str();
    // title → status → priority → labels → parent → links の順を検証。
    let title = s.find("title:").expect("title");
    let status = s.find("status:").expect("status");
    let priority = s.find("priority:").expect("priority");
    let labels = s.find("labels:").expect("labels");
    let parent = s.find("parent:").expect("parent");
    let links = s.find("links:").expect("links");
    assert!(title < status);
    assert!(status < priority);
    assert!(priority < labels);
    assert!(labels < parent);
    assert!(parent < links);
}

#[test]
fn from_intent_omits_links_key_when_empty() {
    let intent = intent_with("T", "Todo", None, vec![], None, None);
    let content = TaskContent::from_intent(&intent, None, &[]).expect("valid");
    assert!(!content.as_str().contains("links:"));
}

#[test]
fn from_intent_renders_multiple_links() {
    let intent = intent_with("T", "Todo", None, vec![], None, None);
    let links = vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()];
    let content = TaskContent::from_intent(&intent, None, &links).expect("valid");
    let s = content.as_str();
    assert!(s.contains("- tasks/a.md"));
    assert!(s.contains("- tasks/b.md"));
}
