use std::path::PathBuf;

use super::{
    resolve_parent_for_new_task, validate_chain_from_parent, validate_parent_existence,
    validate_parent_hierarchy, ParentHierarchyErrorReason,
};
use crate::task::parse::{task_from_markdown, TaskParseContext, TaskParseError};
use crate::task::task_index::Task;
use crate::task::warning::{TaskWarning, TaskWarningCode};

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
fn parent_existence_validation_does_not_warn_when_parent_is_missing_or_existing() {
    let tasks = validate_parent_existence(vec![
        task_from("---\ntitle: Root\nstatus: Todo\n---\n", "tasks/root.md"),
        task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
        task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\n---\n",
            "tasks/child.md",
        ),
    ]);

    assert!(tasks[0].warnings.is_empty());
    assert!(tasks[2]
        .warnings
        .iter()
        .all(|warning| warning.code != TaskWarningCode::ParentNotFound));
}

#[test]
fn missing_parent_adds_warning_without_dropping_task_or_parent_value() {
    let tasks = validate_parent_existence(vec![task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
        "tasks/child.md",
    )]);

    assert_eq!(tasks[0].parent, Some("tasks/missing.md".into()));
    assert!(tasks[0].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn empty_parent_adds_warning_without_normalizing_parent_value() {
    let tasks = validate_parent_existence(vec![task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: ''\n---\n",
        "tasks/child.md",
    )]);

    assert_eq!(tasks[0].parent, Some(String::new().into()));
    assert!(tasks[0].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn parent_existence_validation_warns_each_task_and_keeps_existing_warnings() {
    let tasks = validate_parent_existence(vec![
        task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing-a.md\n---\n",
            "tasks/child-a.md",
        ),
        task_from(
            "---\ntitle: 123\nstatus: Todo\nparent: tasks/missing-b.md\n---\n",
            "tasks/child-b.md",
        ),
    ]);

    assert!(tasks[0].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
    assert!(tasks[1]
        .warnings
        .iter()
        .any(|warning| warning.code == TaskWarningCode::InvalidTitleUsedFileName));
    assert!(tasks[1].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn parent_existence_validation_does_not_duplicate_parent_not_found_warning() {
    let mut task = task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
        "tasks/child.md",
    );
    task.warnings.push(TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".into()),
        message: "parent task was not found".to_string(),
    });

    let tasks = validate_parent_existence(vec![task]);
    let warning_count = tasks[0]
        .warnings
        .iter()
        .filter(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        })
        .count();

    assert_eq!(warning_count, 1);
}

#[test]
fn self_parent_is_treated_as_existing_parent() {
    let tasks = validate_parent_existence(vec![task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/child.md\n---\n",
        "tasks/child.md",
    )]);

    assert!(tasks[0]
        .warnings
        .iter()
        .all(|warning| warning.code != TaskWarningCode::ParentNotFound));
}

#[test]
fn direct_cycle_returns_cycle_or_too_deep() {
    let result = validate_parent_hierarchy(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::Cycle,
        }) if file_path == "tasks/a.md"
    ));
}

#[test]
fn multi_node_cycle_returns_cycle_or_too_deep() {
    let result = validate_parent_hierarchy(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/c.md"),
        task_with_parent("tasks/c.md", "tasks/a.md"),
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
fn depth_over_20_returns_cycle_or_too_deep() {
    let result = validate_parent_hierarchy(parent_chain_with_edge_count(21));

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::TooDeep,
        }) if file_path == "tasks/0.md"
    ));
}

#[test]
fn depth_20_is_allowed() {
    let result = validate_parent_hierarchy(parent_chain_with_edge_count(20));

    assert!(result.is_ok());
}

#[test]
fn missing_parent_keeps_warning_without_cycle_error() {
    let tasks =
        validate_parent_hierarchy(vec![task_with_parent("tasks/child.md", "tasks/missing.md")])
            .unwrap();

    assert_eq!(tasks[0].parent, Some("tasks/missing.md".into()));
    assert!(tasks[0].warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn separator_variation_cycle_is_detected() {
    let result = validate_parent_hierarchy(vec![
        task_with_parent("tasks/a.md", ".\\tasks\\b.md"),
        task_with_parent("tasks/b.md", "./tasks/a.md"),
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
fn cycle_or_too_deep_error_message_includes_file_path_and_reason() {
    let result = validate_parent_hierarchy(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);
    let Err(error) = result else {
        panic!("cycle should return error");
    };

    assert_eq!(
        error.to_string(),
        "parent chain for 'tasks/a.md' contains a cycle"
    );
}

#[test]
fn parent_lookup_accepts_separator_and_current_directory_variations() {
    let cases = ["tasks\\parent.md", "./tasks/parent.md"];

    for parent in cases {
        let tasks = validate_parent_existence(vec![
            task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
            task_from(
                &format!("---\ntitle: Child\nstatus: Todo\nparent: {parent}\n---\n"),
                "tasks/child.md",
            ),
        ]);

        assert!(
            tasks[1]
                .warnings
                .iter()
                .all(|warning| warning.code != TaskWarningCode::ParentNotFound),
            "{parent}"
        );
    }
}

#[test]
fn parent_lookup_rejects_absolute_or_drive_prefixed_parent_paths() {
    let cases = ["/tasks/parent.md", "C:\\tasks\\parent.md"];

    for parent in cases {
        let tasks = validate_parent_existence(vec![
            task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
            task_from(
                &format!("---\ntitle: Child\nstatus: Todo\nparent: {parent}\n---\n"),
                "tasks/child.md",
            ),
        ]);

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
fn resolve_parent_for_new_task_hit_cases() {
    let tasks = vec![task_without_parent("tasks/a.md")];
    let cases: Vec<(&str, &str)> = vec![
        ("tasks/a.md", "exact match"),
        ("./tasks/a.md", "leading ./ normalized"),
        ("tasks\\a.md", "backslash separator"),
    ];
    for (parent, label) in cases {
        assert_eq!(
            resolve_parent_for_new_task(parent, &tasks),
            Some(0),
            "{label}"
        );
    }
}

#[test]
fn resolve_parent_for_new_task_miss_cases_with_existing_task() {
    let tasks = vec![task_without_parent("tasks/a.md")];
    let cases: Vec<(&str, &str)> = vec![
        ("tasks/missing.md", "no matching path"),
        ("", "empty parent string"),
        ("/abs/path.md", "absolute path"),
        ("C:\\foo.md", "windows drive prefix"),
    ];
    for (parent, label) in cases {
        assert_eq!(resolve_parent_for_new_task(parent, &tasks), None, "{label}");
    }
}

#[test]
fn resolve_parent_for_new_task_returns_none_for_empty_tasks() {
    let tasks: Vec<Task> = Vec::new();

    assert_eq!(resolve_parent_for_new_task("tasks/a.md", &tasks), None);
}

#[test]
fn validate_chain_from_parent_single_root_returns_ok() {
    let tasks = vec![task_without_parent("tasks/a.md")];

    assert_eq!(validate_chain_from_parent(0, &tasks), Ok(()));
}

#[test]
fn validate_chain_from_parent_edge_19_is_allowed() {
    let tasks = parent_chain_with_edge_count(19);

    assert_eq!(validate_chain_from_parent(0, &tasks), Ok(()));
}

#[test]
fn validate_chain_from_parent_edge_20_returns_too_deep() {
    let tasks = parent_chain_with_edge_count(20);

    assert_eq!(
        validate_chain_from_parent(0, &tasks),
        Err(ParentHierarchyErrorReason::TooDeep),
    );
}

#[test]
fn validate_chain_from_parent_detects_cycle() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    assert_eq!(
        validate_chain_from_parent(0, &tasks),
        Err(ParentHierarchyErrorReason::Cycle),
    );
}
