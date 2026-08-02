use super::{Patch, TaskDocument, TaskDocumentError, TaskDraft, TaskPatch};
use crate::task::frontmatter::Priority;

#[test]
fn parse_render_preserves_unknown_keys_and_normalizes_crlf_without_losing_body() {
    let input = "---\r\nassignee: alice\r\ntitle: Original\r\nstatus: Todo\r\nlabels: [one, two]\r\ncustom:\r\n  nested: true\r\n---\r\nbody\r\nline\r\n";

    let document = TaskDocument::parse(input.as_bytes()).expect("document should parse");
    let rendered = document.render().expect("document should render");

    assert!(rendered.starts_with("---\ntitle: Original\nstatus: Todo\nlabels:\n"));
    assert!(rendered.contains("assignee: alice\ncustom:\n  nested: true\n"));
    assert!(rendered.ends_with("body\nline\n"));
    assert!(!rendered.contains('\r'));
}

#[test]
fn apply_distinguishes_unchanged_set_and_clear_for_typed_fields() {
    let source = "---\ntitle: Original\nstatus: Todo\npriority: Low\nlabels: [old]\nmilestone: v1\nparent: tasks/parent.md\nlinks: [tasks/old.md]\ndraft: true\ndue: 2026-01-01\n---\nbody\n";
    let mut document = TaskDocument::parse(source.as_bytes()).expect("document should parse");

    document
        .apply(TaskPatch {
            title: Patch::Unchanged,
            status: Patch::Set("Doing".into()),
            priority: Patch::Set(Priority::High),
            labels: Patch::Set(vec!["new".into()]),
            milestone: Patch::Clear,
            parent: Patch::Clear,
            links: Patch::Set(vec!["tasks/next.md".into()]),
            draft: Patch::Clear,
            due: Patch::Clear,
            body: Patch::Set("updated body".into()),
        })
        .expect("patch should apply");

    let rendered = document.render().expect("document should render");

    assert!(rendered.contains("title: Original\nstatus: Doing\npriority: High\n"));
    assert!(rendered.contains("- new\n"));
    assert!(rendered.contains("links:\n- tasks/next.md\n"));
    assert!(!rendered.contains("milestone:"));
    assert!(!rendered.contains("parent:"));
    assert!(!rendered.contains("draft:"));
    assert!(!rendered.contains("due:"));
    assert!(rendered.ends_with("updated body\n"));
}

#[test]
fn draft_renderer_is_typed_and_round_trips_special_strings() {
    let document = TaskDocument::from_draft(TaskDraft {
        title: "Title: #1".into(),
        status: "In Progress".into(),
        priority: Some(Priority::Medium),
        labels: vec!["needs:review".into()],
        milestone: Some("v1".into()),
        parent: Some("tasks/parent.md".into()),
        links: vec!["tasks/related.md".into()],
        due: Some("2026-08-01".into()),
        draft: true,
        body: "line one\nline two".into(),
    });

    let rendered = document.render().expect("draft should render");
    let reparsed = TaskDocument::parse(rendered.as_bytes()).expect("rendered draft should parse");

    assert_eq!(reparsed.title_raw(), Some("Title: #1"));
    assert_eq!(reparsed.status_raw(), Some("In Progress"));
    assert_eq!(reparsed.labels(), &["needs:review"]);
    assert_eq!(reparsed.body(), "\nline one\nline two\n");
}

#[test]
fn parse_without_frontmatter_returns_typed_not_task_error() {
    let error = TaskDocument::parse(b"# heading\n").expect_err("frontmatter is required");

    assert!(matches!(error, TaskDocumentError::NotTask));
}
