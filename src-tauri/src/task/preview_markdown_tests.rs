use super::{preview_task_markdown_impl, PreviewTaskMarkdownArgs};

#[test]
fn preview_args_deserialize_camel_case_and_defaults() {
    let args: PreviewTaskMarkdownArgs = serde_json::from_str(
        r#"{
            "title": "Preview",
            "status": "Todo",
            "priority": null,
            "parent": null,
            "due": null
        }"#,
    )
    .expect("preview args should deserialize");

    assert_eq!(args.labels, Vec::<String>::new());
    assert_eq!(args.links, Vec::<String>::new());
    assert!(!args.draft);
    assert!(args.body.is_empty());
}

#[test]
fn preview_renders_all_fields_with_the_shared_document_codec() {
    let markdown = preview_task_markdown_impl(PreviewTaskMarkdownArgs {
        title: "Title: #1".into(),
        status: "Doing".into(),
        priority: Some("high".into()),
        labels: vec!["bug".into(), "needs:review".into()],
        parent: Some("tasks/parent.md".into()),
        links: vec!["tasks/related.md".into()],
        due: Some("2026-08-01".into()),
        draft: true,
        body: "line one\nline two".into(),
    })
    .expect("preview should render");

    assert!(markdown.starts_with("---\ntitle: 'Title: #1'\nstatus: Doing\npriority: High\n"));
    assert!(markdown.contains("labels:\n- bug\n- needs:review\n"));
    assert!(markdown.contains("parent: tasks/parent.md\nlinks:\n- tasks/related.md\n"));
    assert!(markdown.contains("draft: true\ndue: 2026-08-01\n"));
    assert!(markdown.ends_with("\nline one\nline two\n"));
}

#[test]
fn invalid_priority_is_lenient_and_omitted_like_create() {
    let markdown = preview_task_markdown_impl(PreviewTaskMarkdownArgs {
        title: "Preview".into(),
        status: "Todo".into(),
        priority: Some("urgent".into()),
        labels: Vec::new(),
        parent: None,
        links: Vec::new(),
        due: None,
        draft: false,
        body: String::new(),
    })
    .expect("invalid priority should be lenient");

    assert!(!markdown.contains("priority:"));
}
