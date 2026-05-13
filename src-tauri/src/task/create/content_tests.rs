use super::super::args::CreateTaskArgs;
use super::build_task_content;

#[test]
fn build_task_content_renders_title_and_status_in_fixed_order() {
    let args = CreateTaskArgs {
        title: "Foo Bar".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: None,
        body: None,
    };
    let content = build_task_content(&args, None).expect("valid content");
    let s = content.as_str();
    assert!(s.starts_with("---\ntitle: Foo Bar\nstatus: Todo\n"));
    assert!(!s.contains("priority:"));
    assert!(!s.contains("labels:"));
    assert!(!s.contains("parent:"));
}

#[test]
fn build_task_content_normalizes_priority_case_insensitively() {
    let cases: Vec<(&str, &str)> = vec![("high", "High"), ("HIGH", "High"), ("MeDiUm", "Medium")];
    for (input, expected) in cases {
        let args = CreateTaskArgs {
            title: "T".into(),
            status: "Todo".into(),
            priority: Some(input.to_string()),
            labels: Vec::new(),
            parent: None,
            body: None,
        };
        let content = build_task_content(&args, None).expect("valid content");
        let s = content.as_str();
        assert!(
            s.contains(&format!("priority: {expected}")),
            "priority {input} → {expected} expected, got:\n{s}"
        );
    }
}

#[test]
fn build_task_content_omits_priority_for_invalid_string() {
    let args = CreateTaskArgs {
        title: "T".into(),
        status: "Todo".into(),
        priority: Some("urgent".into()),
        labels: Vec::new(),
        parent: None,
        body: None,
    };
    let content = build_task_content(&args, None).expect("valid content");
    let s = content.as_str();
    assert!(
        !s.contains("priority:"),
        "invalid priority should be omitted, got:\n{s}"
    );
}

#[test]
fn build_task_content_renders_labels_and_parent_and_body() {
    let args = CreateTaskArgs {
        title: "T".into(),
        status: "Todo".into(),
        priority: Some("High".into()),
        labels: vec!["bug".into(), "api".into()],
        parent: Some("tasks/p.md".into()),
        body: Some("hello body".into()),
    };
    let content = build_task_content(&args, Some("tasks/p.md")).expect("valid content");
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
