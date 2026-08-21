use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::*;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn write_template(root: &Path, file_name: &str, content: &str) {
    let dir = root.join(".spec-board").join("templates");
    fs::create_dir_all(&dir).expect("create templates dir");
    fs::write(dir.join(file_name), content).expect("write template");
}

#[test]
fn returns_empty_payload_without_project() {
    let state = AppState::new();
    let payload = get_task_templates_impl(&state).expect("should succeed");
    assert!(payload.templates.is_empty());
}

#[test]
fn returns_empty_payload_when_templates_dir_is_missing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let payload = get_task_templates_impl(&state).expect("should succeed");
    assert!(payload.templates.is_empty());
}

#[test]
fn parses_frontmatter_fields_into_template_payload() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    write_template(
        dir.path(),
        "bug-report.md",
        concat!(
            "---\n",
            "title: バグ報告\n",
            "status: Todo\n",
            "priority: High\n",
            "labels:\n",
            "  - bug\n",
            "milestone: v1.0\n",
            "links:\n",
            "  - tasks/triage.md\n",
            "due: 2026-09-01\n",
            "draft: true\n",
            "---\n",
            "## 再現手順\n",
        ),
    );

    let payload = get_task_templates_impl(&state).expect("should succeed");

    assert_eq!(payload.templates.len(), 1);
    let template = &payload.templates[0];
    assert_eq!(template.name, "bug-report");
    assert_eq!(template.title.as_deref(), Some("バグ報告"));
    assert_eq!(template.status.as_deref(), Some("Todo"));
    assert_eq!(template.priority, Some(Priority::High));
    assert_eq!(template.labels, vec!["bug".to_string()]);
    assert_eq!(template.milestone.as_deref(), Some("v1.0"));
    assert_eq!(template.links, vec!["tasks/triage.md".to_string()]);
    assert_eq!(template.due.as_deref(), Some("2026-09-01"));
    assert!(template.draft);
    assert_eq!(template.body, "## 再現手順\n");
}

#[test]
fn template_without_frontmatter_becomes_body_only() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    write_template(dir.path(), "note.md", "本文だけのテンプレート\n");

    let payload = get_task_templates_impl(&state).expect("should succeed");

    assert_eq!(payload.templates.len(), 1);
    let template = &payload.templates[0];
    assert_eq!(template.name, "note");
    assert_eq!(template.title, None);
    assert_eq!(template.status, None);
    assert_eq!(template.priority, None);
    assert!(template.labels.is_empty());
    assert!(!template.draft);
    assert_eq!(template.body, "本文だけのテンプレート\n");
}

#[test]
fn template_with_broken_frontmatter_is_skipped() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    write_template(
        dir.path(),
        "broken.md",
        "---\ntitle: [unclosed\n---\nbody\n",
    );
    write_template(dir.path(), "valid.md", "---\ntitle: OK\n---\nbody\n");

    let payload = get_task_templates_impl(&state).expect("should succeed");

    let names: Vec<&str> = payload
        .templates
        .iter()
        .map(|template| template.name.as_str())
        .collect();
    assert_eq!(names, vec!["valid"]);
}

#[test]
fn templates_are_sorted_by_name() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    write_template(dir.path(), "feature.md", "feature\n");
    write_template(dir.path(), "bug.md", "bug\n");

    let payload = get_task_templates_impl(&state).expect("should succeed");

    let names: Vec<&str> = payload
        .templates
        .iter()
        .map(|template| template.name.as_str())
        .collect();
    assert_eq!(names, vec!["bug", "feature"]);
}

#[test]
fn lenient_fields_fall_back_without_failing_the_template() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    write_template(
        dir.path(),
        "lenient.md",
        concat!(
            "---\n",
            "title: 123\n",
            "priority: urgent\n",
            "labels: single\n",
            "draft: yes\n",
            "---\n",
            "body\n",
        ),
    );

    let payload = get_task_templates_impl(&state).expect("should succeed");

    assert_eq!(payload.templates.len(), 1);
    let template = &payload.templates[0];
    assert_eq!(template.title, None);
    assert_eq!(template.priority, None);
    assert_eq!(template.labels, vec!["single".to_string()]);
    assert!(!template.draft);
}

#[test]
fn payload_serializes_with_camel_case_and_omits_absent_fields() {
    let template = TaskTemplatePayload {
        name: "bug".to_string(),
        title: Some("バグ".to_string()),
        status: None,
        priority: None,
        labels: Vec::new(),
        milestone: None,
        links: Vec::new(),
        due: None,
        draft: false,
        body: "body".to_string(),
    };
    let json = serde_json::to_string(&template).expect("serialize");
    assert_eq!(
        json,
        r#"{"name":"bug","title":"バグ","labels":[],"links":[],"draft":false,"body":"body"}"#
    );
}
