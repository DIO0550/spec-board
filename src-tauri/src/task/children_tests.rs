use std::path::PathBuf;

use super::build_children;
use crate::task::parent_validation::ParentHierarchyErrorReason;
use crate::task::parse::{task_from_markdown, TaskParseContext, TaskParseError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::warning::TaskWarningCode;

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    task_from_markdown(input.as_bytes(), &context(path)).unwrap()
}

fn task_with_parent(path: &str, parent: &str) -> Task {
    task_from(
        &format!("---\ntitle: Task\nstatus: Todo\nparent: {parent}\n---\n"),
        path,
    )
}

fn task_without_parent(path: &str) -> Task {
    task_from("---\ntitle: Task\nstatus: Todo\n---\n", path)
}

fn parent_chain_with_edge_count(edge_count: usize) -> Vec<Task> {
    let mut tasks = Vec::new();

    for index in 0..edge_count {
        tasks.push(task_with_parent(
            &format!("tasks/{index}.md"),
            &format!("tasks/{}.md", index + 1),
        ));
    }

    tasks.push(task_without_parent(&format!("tasks/{edge_count}.md")));
    tasks
}

#[test]
fn build_children_adds_child_file_path_to_parent() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[0].children,
        vec![TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn build_children_adds_child_file_paths_to_parent_in_input_order() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child-a.md", "tasks/parent.md"),
        task_with_parent("tasks/child-b.md", "tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[0].children,
        vec![
            "tasks/child-a.md".to_string(),
            "tasks/child-b.md".to_string(),
        ]
    );
}

#[test]
fn build_children_adds_child_when_parent_appears_later() {
    let tasks = vec![
        task_with_parent("tasks/child.md", "tasks/parent.md"),
        task_without_parent("tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[1].children,
        vec![TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn build_children_clears_existing_children_before_recalculation() {
    let mut parent = task_without_parent("tasks/parent.md");
    parent.children = vec![
        "tasks/stale.md".into(),
        "tasks/child.md".into(),
        "tasks/child.md".into(),
    ];
    let tasks = vec![
        parent,
        task_with_parent("tasks/child.md", "tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[0].children,
        vec![TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn build_children_matches_parent_with_dot_prefix() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "./tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[0].children,
        vec![TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn build_children_matches_parent_with_backslash_separator() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks\\parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(
        tasks[0].children,
        vec![TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn build_children_keeps_missing_parent_warning_without_child_append() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks/missing.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert!(tasks[0].children.is_empty());
    assert!(tasks[1].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn build_children_ignores_empty_absolute_and_drive_prefix_parent_for_child_append() {
    let cases = ["", "/tasks/parent.md", "C:\\tasks\\parent.md"];

    for parent in cases {
        let mut child = task_without_parent("tasks/child.md");
        child.parent = Some(parent.into());
        let tasks = vec![task_without_parent("tasks/parent.md"), child];

        let tasks = build_children(tasks).unwrap();

        assert!(tasks[0].children.is_empty(), "{parent}");
        assert!(
            tasks[1].warnings.iter().any(|warning| {
                warning.code == TaskWarningCode::ParentNotFound
                    && warning.field.as_deref() == Some("parent")
            }),
            "{parent}"
        );
    }
}

#[test]
fn build_children_returns_error_for_self_reference() {
    let result = build_children(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::Cycle,
        }) if file_path == "tasks/a.md"
    ));
}

#[test]
fn build_children_returns_error_for_cycle() {
    let result = build_children(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::Cycle,
        }) if file_path == "tasks/a.md"
    ));
}

#[test]
fn build_children_returns_error_for_parent_chain_over_max_depth() {
    let result = build_children(parent_chain_with_edge_count(21));

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::TooDeep,
        }) if file_path == "tasks/0.md"
    ));
}

#[test]
fn build_children_accepts_empty_tasks() {
    let tasks = build_children(Vec::new()).unwrap();

    assert!(tasks.is_empty());
}
