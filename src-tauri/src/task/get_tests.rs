use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::*;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;

fn open_with_noop(state: Arc<AppState>, path: &str) {
    let intent = OpenProjectIntent::try_from(path.to_string()).expect("non-empty path");
    open_project_impl(&state, &intent, &NoopWatcherFactory).expect("open should succeed");
}

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn write_md(root: &Path, rel: &str, body: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(&absolute, body).expect("write md");
}

fn task_md(title: &str, status: &str, parent: Option<&str>) -> String {
    task_md_with_links(title, status, parent, &[])
}

fn task_md_with_links(title: &str, status: &str, parent: Option<&str>, links: &[&str]) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("title: {title}\n"));
    s.push_str(&format!("status: {status}\n"));
    if let Some(p) = parent {
        s.push_str(&format!("parent: {p}\n"));
    }
    if !links.is_empty() {
        let joined = links
            .iter()
            .map(|l| format!("\"{l}\""))
            .collect::<Vec<_>>()
            .join(", ");
        s.push_str(&format!("links: [{joined}]\n"));
    }
    s.push_str("---\n\nbody\n");
    s
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let converted: GetTasksError = AppStateError::LockPoisoned.into();
    assert_eq!(GetTasksError::StateLockPoisoned, converted);
}

#[test]
fn state_lock_poisoned_display_matches_open_project_contract() {
    assert_eq!(
        "内部状態のロックが破損しました",
        GetTasksError::StateLockPoisoned.to_string()
    );
}

#[test]
fn returns_empty_vec_when_app_state_is_uninitialized() {
    let state = AppState::new();

    let tasks = get_tasks_impl(&state).expect("should succeed even before open_project");

    assert!(tasks.is_empty());
}

#[test]
fn returns_tasks_sorted_by_id_after_open_project() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let tasks = get_tasks_impl(&state).expect("get_tasks should succeed");

    let ids: Vec<&str> = tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/a.md", "tasks/b.md"], ids);
}

#[test]
fn preserves_children_and_reverse_links_built_by_open_project() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_links("A", "Todo", Some("tasks/b.md"), &["tasks/b.md"]),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let tasks = get_tasks_impl(&state).expect("get_tasks should succeed");

    let task_a = tasks
        .iter()
        .find(|t| t.id == "tasks/a.md")
        .expect("task a exists");
    let task_b = tasks
        .iter()
        .find(|t| t.id == "tasks/b.md")
        .expect("task b exists");

    assert_eq!(vec!["tasks/a.md".to_string()], task_b.children);
    assert!(task_a.children.is_empty());

    assert_eq!(vec!["tasks/a.md".to_string()], task_b.reverse_links);
    assert!(task_a.reverse_links.is_empty());

    assert_eq!(vec!["tasks/b.md".to_string()], task_a.links);
}
