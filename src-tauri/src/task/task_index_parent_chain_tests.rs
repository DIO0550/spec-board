use std::path::PathBuf;

use super::{
    resolve_parent_for_new_task, validate_chain_from_parent, validate_parent_existence,
    validate_parent_hierarchy, ParentHierarchyErrorReason, Task, TaskIndex,
};
use crate::task::parse::{task_from_markdown, TaskParseContext, TaskParseError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::warning::TaskWarningCode;

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(input.as_bytes(), &context(path)).unwrap(),
    )
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

    assert!(tasks[0].warnings().is_empty());
    assert!(tasks[2]
        .warnings()
        .iter()
        .all(|warning| warning.code != TaskWarningCode::ParentNotFound));
}

#[test]
fn missing_parent_adds_warning_without_dropping_task_or_parent_value() {
    let tasks = validate_parent_existence(vec![task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
        "tasks/child.md",
    )]);

    assert_eq!(
        tasks[0].parent().map(TaskFilePath::as_str),
        Some("tasks/missing.md")
    );
    assert!(tasks[0].warnings().iter().any(|warning| {
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

    assert_eq!(tasks[0].parent().map(TaskFilePath::as_str), Some(""));
    assert!(tasks[0].warnings().iter().any(|warning| {
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

    assert!(tasks[0].warnings().iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
    assert!(tasks[1]
        .warnings()
        .iter()
        .any(|warning| warning.code == TaskWarningCode::InvalidTitleUsedFileName));
    assert!(tasks[1].warnings().iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
}

#[test]
fn parent_existence_validation_does_not_duplicate_parent_not_found_warning() {
    let task = task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
        "tasks/child.md",
    );
    let tasks = validate_parent_existence(vec![task]);
    let warning_count = tasks[0]
        .warnings()
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
        .warnings()
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

    assert_eq!(
        tasks[0].parent().map(TaskFilePath::as_str),
        Some("tasks/missing.md")
    );
    assert!(tasks[0].warnings().iter().any(|warning| {
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
                .warnings()
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
            tasks[1].warnings().iter().any(|warning| {
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

fn task_by_path<'a>(tasks: &'a [Task], path: &str) -> &'a Task {
    tasks
        .iter()
        .find(|t| t.file_path.as_str() == path)
        .unwrap_or_else(|| panic!("expected task at `{path}` in {:?}", tasks))
}

fn has_parent_cycle_warning(task: &Task) -> bool {
    task.warnings().iter().any(|warning| {
        warning.code == TaskWarningCode::ParentCycle && warning.field.as_deref() == Some("parent")
    })
}

#[test]
fn build_children_with_warnings_keeps_parent_when_no_cycle() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks/parent.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("no cycle, no too-deep");
    let tasks = index.into_tasks();

    let child = task_by_path(&tasks, "tasks/child.md");
    assert_eq!(
        child.parent().map(TaskFilePath::as_str),
        Some("tasks/parent.md")
    );
    assert!(!has_parent_cycle_warning(child));
    let parent = task_by_path(&tasks, "tasks/parent.md");
    assert!(!has_parent_cycle_warning(parent));
    // children も build される
    assert_eq!(
        parent.children(),
        vec!["tasks/child.md".to_string()],
        "non-cycle parent should still gain its child"
    );
}

#[test]
fn build_children_with_warnings_keeps_parent_not_found_warning() {
    let tasks = vec![task_with_parent("tasks/child.md", "tasks/missing.md")];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("missing parent should not error");
    let tasks = index.into_tasks();

    let child = task_by_path(&tasks, "tasks/child.md");
    assert!(child.warnings().iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    }));
    // parent_not_found のままで parent は保持されている
    assert_eq!(
        child.parent().map(TaskFilePath::as_str),
        Some("tasks/missing.md")
    );
    assert!(!has_parent_cycle_warning(child));
}

#[test]
fn build_children_with_warnings_marks_self_loop_as_cycle() {
    let tasks = vec![task_with_parent("tasks/a.md", "tasks/a.md")];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("self loop should warn, not error");
    let tasks = index.into_tasks();

    let a = task_by_path(&tasks, "tasks/a.md");
    assert!(has_parent_cycle_warning(a), "self loop must add warning");
    assert_eq!(a.parent(), None, "self loop must clear parent");
    assert!(
        a.children().is_empty(),
        "self loop should not become its own child"
    );
}

#[test]
fn build_children_with_warnings_marks_two_node_cycle() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("two-node cycle should warn, not error");
    let tasks = index.into_tasks();

    let a = task_by_path(&tasks, "tasks/a.md");
    let b = task_by_path(&tasks, "tasks/b.md");
    assert!(has_parent_cycle_warning(a));
    assert!(has_parent_cycle_warning(b));
    assert_eq!(a.parent(), None);
    assert_eq!(b.parent(), None);
    assert!(a.children().is_empty());
    assert!(b.children().is_empty());
}

#[test]
fn build_children_with_warnings_marks_three_node_cycle() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/c.md"),
        task_with_parent("tasks/c.md", "tasks/a.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("three-node cycle should warn, not error");
    let tasks = index.into_tasks();

    for path in ["tasks/a.md", "tasks/b.md", "tasks/c.md"] {
        let task = task_by_path(&tasks, path);
        assert!(
            has_parent_cycle_warning(task),
            "{path} should have parentCycle warning"
        );
        assert_eq!(task.parent(), None, "{path} should have parent cleared");
    }
}

#[test]
fn build_children_with_warnings_excludes_tail_from_cycle() {
    // D は A→B→A の cycle に到達する tail。D 自身は cycle の一部ではない。
    let tasks = vec![
        task_with_parent("tasks/d.md", "tasks/a.md"),
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("tail cycle should warn, not error");
    let tasks = index.into_tasks();

    let a = task_by_path(&tasks, "tasks/a.md");
    let b = task_by_path(&tasks, "tasks/b.md");
    let d = task_by_path(&tasks, "tasks/d.md");
    assert!(has_parent_cycle_warning(a));
    assert!(has_parent_cycle_warning(b));
    assert!(
        !has_parent_cycle_warning(d),
        "D is only a tail and must not be flagged"
    );
    assert_eq!(
        d.parent().map(TaskFilePath::as_str),
        Some("tasks/a.md"),
        "D's parent must be kept"
    );
}

#[test]
fn build_children_with_warnings_detects_separator_variation_cycle() {
    let tasks = vec![
        task_with_parent("tasks/a.md", ".\\tasks\\b.md"),
        task_with_parent("tasks/b.md", "./tasks/a.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("separator variation cycle should warn, not error");
    let tasks = index.into_tasks();

    assert!(has_parent_cycle_warning(task_by_path(&tasks, "tasks/a.md")));
    assert!(has_parent_cycle_warning(task_by_path(&tasks, "tasks/b.md")));
}

#[test]
fn build_children_with_warnings_keeps_existing_warning_when_adding_cycle() {
    // 循環 task に既存 warning (invalidTitleUsedFileName) を併存させたケース。
    // タイトル `123` は数値として yaml にパースされて invalidTitleUsedFileName warning を生む。
    let raw_a = "---\ntitle: 123\nstatus: Todo\nparent: tasks/b.md\n---\n";
    let raw_b = "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n";
    let tasks = vec![
        task_from(raw_a, "tasks/a.md"),
        task_from(raw_b, "tasks/b.md"),
    ];

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("warning + cycle");
    let tasks = index.into_tasks();

    let a = task_by_path(&tasks, "tasks/a.md");
    assert!(
        a.warnings()
            .iter()
            .any(|w| w.code == TaskWarningCode::InvalidTitleUsedFileName),
        "pre-existing warning must be preserved"
    );
    assert!(has_parent_cycle_warning(a));
}

#[test]
fn build_children_with_warnings_does_not_duplicate_cycle_warning() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let tasks = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("cycle should be normalized")
        .into_tasks();

    let index = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("duplicate cycle warning should not error");
    let tasks = index.into_tasks();

    let a = task_by_path(&tasks, "tasks/a.md");
    let cycle_count = a
        .warnings()
        .iter()
        .filter(|w| w.code == TaskWarningCode::ParentCycle && w.field.as_deref() == Some("parent"))
        .count();
    assert_eq!(cycle_count, 1, "parentCycle warning must not be duplicated");
}

#[test]
fn build_children_with_warnings_returns_too_deep_for_depth_over_max() {
    let result = TaskIndex::new(parent_chain_with_edge_count(21)).build_children_with_warnings();

    assert!(matches!(
        result,
        Err(TaskParseError::CycleOrTooDeep {
            file_path,
            reason: ParentHierarchyErrorReason::TooDeep,
        }) if file_path == "tasks/0.md"
    ));
}

#[test]
fn build_children_with_warnings_accepts_max_depth() {
    let index = TaskIndex::new(parent_chain_with_edge_count(20))
        .build_children_with_warnings()
        .expect("depth=20 must be accepted");
    let tasks = index.into_tasks();

    // 全 task が parent 維持・cycle warning なし
    for task in &tasks {
        assert!(
            !has_parent_cycle_warning(task),
            "{} should not be cyclic",
            task.file_path.as_str()
        );
    }
}

#[test]
fn build_children_with_warnings_prefers_too_deep_over_cycle() {
    // 深さ上限 (>20) を超えるノード列の最後で root へループバックさせる。
    // walk 中で depth > MAX_PARENT_DEPTH に先にヒットして TooDeep が返るべき。
    let mut tasks = Vec::new();
    for index in 0..22 {
        tasks.push(task_with_parent(
            &format!("tasks/{index}.md"),
            &format!("tasks/{}.md", index + 1),
        ));
    }
    // 最後の task を 0 へループバック
    tasks.push(task_with_parent("tasks/22.md", "tasks/0.md"));

    let result = TaskIndex::new(tasks).build_children_with_warnings();
    assert!(
        matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                reason: ParentHierarchyErrorReason::TooDeep,
                ..
            })
        ),
        "TooDeep must precede cycle detection when depth limit is reached first: {result:?}"
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
