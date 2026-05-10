use super::super::frontmatter::{Frontmatter, Priority};
use super::*;
use serde_json::json;
use std::collections::BTreeMap;

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".to_string(),
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

fn parsed_with_extras(extras: serde_yaml_ng::Mapping) -> Parsed {
    Parsed {
        frontmatter: Frontmatter {
            extras,
            ..Frontmatter::default()
        },
        body: String::new(),
    }
}

#[test]
fn minimum_frontmatter_generates_task() {
    let task = task_from(
        "---\ntitle: Fix bug\nstatus: Doing\n---\n",
        "tasks/fix-bug.md",
    );

    assert_eq!(task.id, "tasks/fix-bug.md");
    assert_eq!(task.file_path, "tasks/fix-bug.md");
    assert_eq!(task.title, "Fix bug");
    assert_eq!(task.status, "Doing");
    assert_eq!(task.priority, None);
    assert_eq!(task.labels, Vec::<String>::new());
    assert_eq!(task.parent, None);
    assert_eq!(task.links, Vec::<String>::new());
    assert_eq!(task.children, Vec::<String>::new());
    assert_eq!(task.reverse_links, Vec::<String>::new());
    assert_eq!(task.body, "");
    assert_eq!(task.extras, BTreeMap::new());
    assert_eq!(task.warnings, Vec::<TaskWarning>::new());
}

#[test]
fn typed_parser_fields_and_body_are_reflected() {
    let task = task_from(
        "---\ntitle: Feature\nstatus: Doing\npriority: high\nlabels: [bug, bug, api]\nlinks: related.md\n---\nBody\n",
        "feature.md",
    );

    assert_eq!(task.priority, Some(Priority::High));
    assert_eq!(task.labels, vec!["bug".to_string(), "api".to_string()]);
    assert_eq!(task.links, vec!["related.md".to_string()]);
    assert_eq!(task.body, "Body\n");
}

#[test]
fn missing_title_uses_file_name_fallback_with_warning() {
    let task = task_from("---\nstatus: Todo\n---\n", "tasks/fix-login.md");

    assert_eq!(task.title, "fix login");
    assert_eq!(
        task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::MissingTitleUsedFileName,
            field: Some("title".to_string()),
            message: "title is missing; file name was used".to_string(),
        }]
    );
}

#[test]
fn invalid_title_uses_file_name_fallback_with_warning() {
    let cases = [
        ("---\ntitle: ''\nstatus: Todo\n---\n", "空文字"),
        ("---\ntitle: 123\nstatus: Todo\n---\n", "非文字列"),
    ];

    for (input, label) in cases {
        let task = task_from(input, "tasks/fix-login.md");
        assert_eq!(task.title, "fix login", "{label}");
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::InvalidTitleUsedFileName,
                field: Some("title".to_string()),
                message: "title is invalid; file name was used".to_string(),
            }],
            "{label}"
        );
    }
}

#[test]
fn missing_status_uses_default_with_warning() {
    let task = task_from("---\ntitle: Fix bug\n---\n", "tasks/fix-bug.md");

    assert_eq!(task.status, "Todo");
    assert_eq!(
        task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::MissingStatusUsedDefault,
            field: Some("status".to_string()),
            message: "status is missing; default status was used".to_string(),
        }]
    );
}

#[test]
fn invalid_status_uses_default_with_warning() {
    let task = task_from(
        "---\ntitle: Fix bug\nstatus: [Doing]\n---\n",
        "tasks/fix-bug.md",
    );

    assert_eq!(task.status, "Todo");
    assert_eq!(
        task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::InvalidStatusUsedDefault,
            field: Some("status".to_string()),
            message: "status is invalid; default status was used".to_string(),
        }]
    );
}

#[test]
fn parent_is_reflected_when_string_and_ignored_when_missing_or_invalid() {
    let parent_task = task_from(
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\n---\n",
        "tasks/child.md",
    );
    let missing_parent_task = task_from("---\ntitle: Root\nstatus: Todo\n---\n", "tasks/root.md");
    let invalid_parent_task = task_from(
        "---\ntitle: Root\nstatus: Todo\nparent: 123\n---\n",
        "tasks/root.md",
    );

    assert_eq!(parent_task.parent, Some("tasks/parent.md".to_string()));
    assert_eq!(missing_parent_task.parent, None);
    assert_eq!(invalid_parent_task.parent, None);
    assert_eq!(
        invalid_parent_task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::InvalidParentIgnored,
            field: Some("parent".to_string()),
            message: "parent is invalid; value was ignored".to_string(),
        }]
    );
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

    assert_eq!(tasks[0].parent, Some("tasks/missing.md".to_string()));
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

    assert_eq!(tasks[0].parent, Some(String::new()));
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
        field: Some("parent".to_string()),
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
fn build_children_adds_child_file_path_to_parent() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
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

    assert_eq!(tasks[1].children, vec!["tasks/child.md".to_string()]);
}

#[test]
fn build_children_clears_existing_children_before_recalculation() {
    let mut parent = task_without_parent("tasks/parent.md");
    parent.children = vec![
        "tasks/stale.md".to_string(),
        "tasks/child.md".to_string(),
        "tasks/child.md".to_string(),
    ];
    let tasks = vec![
        parent,
        task_with_parent("tasks/child.md", "tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
}

#[test]
fn build_children_matches_parent_with_dot_prefix() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "./tasks/parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
}

#[test]
fn build_children_matches_parent_with_backslash_separator() {
    let tasks = vec![
        task_without_parent("tasks/parent.md"),
        task_with_parent("tasks/child.md", "tasks\\parent.md"),
    ];

    let tasks = build_children(tasks).unwrap();

    assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
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
        child.parent = Some(parent.to_string());
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

#[test]
fn build_reverse_links_adds_source_file_path_to_target() {
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks/target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
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

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    assert_eq!(tasks[2].reverse_links, vec!["tasks/source.md".to_string()]);
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

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
}

#[test]
fn build_reverse_links_clears_existing_reverse_links_before_recalculation() {
    let mut target = task_without_parent("tasks/target.md");
    target.reverse_links = vec![
        "tasks/stale.md".to_string(),
        "tasks/source.md".to_string(),
        "tasks/source.md".to_string(),
    ];
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks/target.md"]),
        target,
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
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

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
}

#[test]
fn build_reverse_links_matches_link_with_backslash_separator() {
    let tasks = vec![
        task_with_links("tasks/source.md", &["tasks\\target.md"]),
        task_without_parent("tasks/target.md"),
    ];

    let tasks = build_reverse_links(tasks);

    assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
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
        source.links = vec![link.to_string()];
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

    assert_eq!(tasks[0].reverse_links, vec!["tasks/source.md".to_string()]);
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

    assert_eq!(tasks[0].parent, Some("tasks/missing.md".to_string()));
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
fn unknown_fields_are_kept_in_extras_as_json_values() {
    let task = task_from(
        "---\ntitle: Fix bug\nstatus: Todo\nestimate: 3\nmeta:\n  owner: alice\n---\n",
        "tasks/fix-bug.md",
    );

    assert_eq!(task.extras.get("estimate"), Some(&json!(3)));
    assert_eq!(task.extras.get("meta"), Some(&json!({ "owner": "alice" })));
}

#[test]
fn non_string_extra_key_is_excluded_with_warning() {
    let mut extras = serde_yaml_ng::Mapping::new();
    extras.insert(
        serde_yaml_ng::Value::String("title".to_string()),
        serde_yaml_ng::Value::String("Fix bug".to_string()),
    );
    extras.insert(
        serde_yaml_ng::Value::String("status".to_string()),
        serde_yaml_ng::Value::String("Todo".to_string()),
    );
    extras.insert(
        serde_yaml_ng::Value::Sequence(vec![serde_yaml_ng::Value::String("a".to_string())]),
        serde_yaml_ng::Value::String("value".to_string()),
    );
    let task = task_from_parsed(parsed_with_extras(extras), &context("tasks/fix-bug.md"));

    assert_eq!(task.extras, BTreeMap::new());
    assert_eq!(
        task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::NonStringExtraKeyIgnored,
            field: None,
            message: "non-string extra key was ignored".to_string(),
        }]
    );
}

#[test]
fn json_incompatible_extra_value_is_excluded_with_warning() {
    let mut extras = serde_yaml_ng::Mapping::new();
    extras.insert(
        serde_yaml_ng::Value::String("title".to_string()),
        serde_yaml_ng::Value::String("Fix bug".to_string()),
    );
    extras.insert(
        serde_yaml_ng::Value::String("status".to_string()),
        serde_yaml_ng::Value::String("Todo".to_string()),
    );
    extras.insert(
        serde_yaml_ng::Value::String("tagged".to_string()),
        serde_yaml_ng::Value::Tagged(Box::new(serde_yaml_ng::value::TaggedValue {
            tag: serde_yaml_ng::value::Tag::new("custom"),
            value: serde_yaml_ng::Value::String("value".to_string()),
        })),
    );
    let task = task_from_parsed(parsed_with_extras(extras), &context("tasks/fix-bug.md"));

    assert_eq!(task.extras, BTreeMap::new());
    assert_eq!(
        task.warnings,
        vec![TaskWarning {
            code: TaskWarningCode::ExtraValueNotJsonCompatible,
            field: Some("tagged".to_string()),
            message: "extra value is not JSON compatible; value was ignored".to_string(),
        }]
    );
}

#[test]
fn typed_keys_are_excluded_from_extras() {
    let task = task_from(
        "---\ntitle: Fix bug\nstatus: Todo\npriority: High\nlabels: [bug]\nparent: parent.md\nlinks: [related.md]\nextra: kept\n---\n",
        "tasks/fix-bug.md",
    );

    assert_eq!(
        task.extras,
        BTreeMap::from([("extra".to_string(), json!("kept"))])
    );
}

#[test]
fn task_serializes_path_fields_and_warning_codes_as_camel_case() {
    let task = task_from(
        "---\nstatus: Todo\nestimate: 3\n---\nBody\n",
        "tasks/fix-bug.md",
    );

    let json_value = serde_json::to_value(task).unwrap();

    assert_eq!(json_value["filePath"], json!("tasks/fix-bug.md"));
    assert_eq!(json_value["reverseLinks"], json!([]));
    assert_eq!(json_value["extras"], json!({ "estimate": 3 }));
    assert_eq!(
        json_value["warnings"][0]["code"],
        json!("missingTitleUsedFileName")
    );
}

#[test]
fn parent_not_found_warning_code_serializes_as_camel_case() {
    let warning = TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".to_string()),
        message: "parent task was not found".to_string(),
    };

    let json_value = serde_json::to_value(warning).unwrap();

    assert_eq!(json_value["code"], json!("parentNotFound"));
}

#[test]
fn task_file_path_payload_is_relative_and_uses_forward_slashes() {
    let cases = [
        ("/project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
        ("C:\\project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
    ];

    for (input_path, expected_path) in cases {
        let task = task_from("---\ntitle: Fix bug\nstatus: Todo\n---\n", input_path);

        assert_eq!(task.id, expected_path);
        assert_eq!(task.file_path, expected_path);
    }
}

#[test]
fn frontmatter_absence_returns_not_task() {
    let result = task_from_markdown(b"# Heading\nbody\n", &context("notes.md"));

    assert!(matches!(result, Err(TaskParseError::NotTask)));
}

#[test]
fn invalid_yaml_or_encoding_returns_frontmatter_error() {
    let invalid_yaml = task_from_markdown(b"---\n: bad\n---\n", &context("bad.md"));
    let invalid_encoding = task_from_markdown(b"\xff\xfe---\n---\n", &context("bad.md"));

    assert!(matches!(invalid_yaml, Err(TaskParseError::Frontmatter(_))));
    assert!(matches!(
        invalid_encoding,
        Err(TaskParseError::Frontmatter(_))
    ));
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
