//! `TaskIndex::project_milestones` のユニットテスト。

use std::collections::HashSet;

use super::{Task, TaskIndex};
use crate::config::column_name::ColumnName;
use crate::task::task_file_path::TaskFilePath;

fn task_with_milestone(id: &str, status: &str, milestone: Option<&str>) -> Task {
    Task {
        draft: false,
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: status.into(),
        priority: None,
        milestone: milestone.map(str::to_owned),
        due: None,
        labels: Vec::new(),
        parent: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

#[test]
fn projects_total_done_and_raw_path_for_one_task() {
    let done_column = ColumnName::from("Done");
    let task = task_with_milestone("tasks/one.md", "Done", Some("v1"));

    let projections = TaskIndex::new(vec![task]).project_milestones(Some(&done_column));
    let projection = projections.get("v1").expect("v1 projection");

    assert_eq!(projection.total, 1);
    assert_eq!(projection.done, 1);
    assert_eq!(
        projection.task_file_paths,
        vec![TaskFilePath::from("tasks/one.md")]
    );
}

#[test]
fn preserves_input_order_for_paths_of_the_same_milestone() {
    let done_column = ColumnName::from("Done");
    let tasks = vec![
        task_with_milestone("tasks/b.md", "Done", Some("v1")),
        task_with_milestone("tasks/a.md", "Todo", Some("v1")),
        task_with_milestone("tasks/c.md", "Done", Some("v1")),
    ];

    let projections = TaskIndex::new(tasks).project_milestones(Some(&done_column));
    let projection = projections.get("v1").expect("v1 projection");
    let paths: Vec<&str> = projection
        .task_file_paths
        .iter()
        .map(TaskFilePath::as_str)
        .collect();

    assert_eq!(projection.total, 3);
    assert_eq!(projection.done, 2);
    assert_eq!(paths, vec!["tasks/b.md", "tasks/a.md", "tasks/c.md"]);
}

#[test]
fn serializes_each_assigned_path_once_for_a_large_task_set() {
    let task_count = 1_024;
    let tasks = (0..task_count)
        .map(|index| {
            task_with_milestone(
                &format!("tasks/{index:04}.md"),
                "Todo",
                Some(&format!("milestone-{}", index % 16)),
            )
        })
        .collect();

    let projections = TaskIndex::new(tasks).project_milestones(None);
    let wire = serde_json::to_value(&projections).expect("projection should serialize");
    let wire_paths: Vec<&str> = wire
        .as_object()
        .expect("wire map")
        .values()
        .flat_map(|projection| {
            projection["taskFilePaths"]
                .as_array()
                .expect("taskFilePaths array")
        })
        .map(|path| path.as_str().expect("string path"))
        .collect();
    let unique_paths: HashSet<&str> = wire_paths.iter().copied().collect();

    assert_eq!(projections.len(), 16);
    assert_eq!(wire_paths.len(), task_count);
    assert_eq!(unique_paths.len(), task_count);
    assert_eq!(
        projections
            .values()
            .map(|projection| projection.total)
            .sum::<usize>(),
        task_count
    );
}

#[test]
fn returns_an_empty_map_for_no_tasks() {
    let projections = TaskIndex::new(Vec::new()).project_milestones(None);

    assert!(projections.is_empty());
}

#[test]
fn excludes_none_and_empty_milestone_names() {
    let tasks = vec![
        task_with_milestone("tasks/none.md", "Todo", None),
        task_with_milestone("tasks/empty.md", "Todo", Some("")),
    ];

    let projections = TaskIndex::new(tasks).project_milestones(None);

    assert!(projections.is_empty());
}

#[test]
fn preserves_unknown_non_empty_names_and_sets_done_to_zero_without_done_column() {
    let tasks = vec![task_with_milestone(
        "tasks/unknown.md",
        "Done",
        Some(" registry-unknown "),
    )];

    let projections = TaskIndex::new(tasks).project_milestones(None);
    let projection = projections
        .get(" registry-unknown ")
        .expect("unknown raw milestone projection");

    assert_eq!(projection.total, 1);
    assert_eq!(projection.done, 0);
}

#[test]
fn preserves_javascript_prototype_like_names_as_independent_keys() {
    let names = ["__proto__", "constructor", "toString"];
    let tasks = names
        .iter()
        .enumerate()
        .map(|(index, name)| task_with_milestone(&format!("tasks/{index}.md"), "Todo", Some(name)))
        .collect();

    let projections = TaskIndex::new(tasks).project_milestones(None);

    assert_eq!(projections.len(), 3);
    for name in names {
        assert_eq!(
            projections.get(name).map(|projection| projection.total),
            Some(1)
        );
    }
}
