use std::path::PathBuf;

use super::build_reverse_links;
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    task_from_markdown(input.as_bytes(), &context(path)).unwrap()
}

fn task_without_parent(path: &str) -> Task {
    task_from("---\ntitle: Task\nstatus: Todo\n---\n", path)
}

fn task_with_links(path: &str, links: &[&str]) -> Task {
    let links_yaml = links
        .iter()
        .map(|link| format!("  - {link}"))
        .collect::<Vec<_>>()
        .join("\n");
    task_from(
        &format!("---\ntitle: Task\nstatus: Todo\nlinks:\n{links_yaml}\n---\n"),
        path,
    )
}

#[test]
fn build_reverse_links_adds_source_file_path_to_target() {
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks/target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_adds_sources_in_input_order() {
    let tasks = vec![
        task_with_links("tasks/source-a.md", &["tasks/target.md"]),
        task_with_links("tasks/source-b.md", &["tasks/target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[2].reverse_links,
        vec![
            "tasks/source-a.md".to_string(),
            "tasks/source-b.md".to_string(),
        ]
    );
}

#[test]
fn build_reverse_links_adds_source_to_each_existing_link_target() {
    let tasks = vec![
        task_with_links(
            "tasks/source.md",
            &["tasks/target-b.md", "tasks/target-a.md"],
        ),
        task_without_parent("tasks/target-a.md"),
        task_without_parent("tasks/target-b.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
    assert_eq!(
        tasks[2].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_deduplicates_normalized_targets_per_source() {
    let tasks = vec![
        task_with_links(
            "tasks/source.md",
            &["tasks/target.md", "./tasks/target.md", "tasks\\target.md"],
        ),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_clears_existing_reverse_links_before_recalculation() {
    let mut target = task_without_parent("tasks/target.md");
    target.reverse_links = vec![
        "tasks/stale.md".into(),
        "tasks/source.md".into(),
        "tasks/source.md".into(),
    ];
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks/target.md"]),
        target,
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_ignores_missing_target() {
    let tasks = vec![task_with_links("tasks/source.md", &["tasks/missing.md"])];

    let tasks = build_reverse_links(tasks);

    assert!(tasks[0].reverse_links.is_empty());
    assert!(tasks[0].warnings.is_empty());
}

#[test]
fn build_reverse_links_matches_link_with_dot_prefix() {
    let tasks = vec![
        task_with_links("tasks/source.md", &["./tasks/target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_matches_link_with_backslash_separator() {
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks\\target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[1].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}

#[test]
fn build_reverse_links_ignores_empty_absolute_and_drive_prefix_link() {
    let cases = [
        "",
        "/tasks/target.md",
        "\\tasks\\target.md",
        "C:\\tasks\\target.md",
    ];

    for link in cases {
        let mut source = task_without_parent("tasks/source.md");
        source.links = vec![link.into()];
        let tasks = vec![source, task_without_parent("tasks/target.md")];

        let tasks = build_reverse_links(tasks);

        assert!(tasks[1].reverse_links.is_empty(), "{link}");
    }
}

#[test]
fn build_reverse_links_accepts_empty_tasks() {
    let tasks = build_reverse_links(Vec::new());

    assert!(tasks.is_empty());
}

#[test]
fn build_reverse_links_allows_self_link() {
    let tasks = vec![task_with_links("tasks/source.md", &["tasks/source.md"])];

    let tasks = build_reverse_links(tasks);

    assert_eq!(
        tasks[0].reverse_links,
        vec![TaskFilePath::from("tasks/source.md")]
    );
}
