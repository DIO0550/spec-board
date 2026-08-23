use std::collections::BTreeMap;
use std::path::PathBuf;

use serde_json::json;

use super::{task_from_markdown, task_from_parsed, TaskParseContext, TaskParseError};
use crate::task::frontmatter::{Frontmatter, Parsed, Priority};
use crate::task::label::Label;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::ParsedTask;
use crate::task::warning::{TaskWarning, TaskWarningCode};

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> ParsedTask {
    task_from_markdown(input.as_bytes(), &context(path)).unwrap()
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

    assert_eq!(task.file_path, "tasks/fix-bug.md");
    assert_eq!(task.title, "Fix bug");
    assert_eq!(task.status, "Doing");
    assert_eq!(task.priority, None);
    assert_eq!(task.labels, Vec::<Label>::new());
    assert_eq!(task.parent, None);
    assert_eq!(task.links, Vec::<TaskFilePath>::new());
    assert_eq!(task.body, "");
    assert_eq!(task.extras, BTreeMap::new());
    assert_eq!(task.parse_warnings, Vec::<TaskWarning>::new());
}

#[test]
fn typed_parser_fields_and_body_are_reflected() {
    let task = task_from(
        "---\ntitle: Feature\nstatus: Doing\npriority: high\nlabels: [bug, bug, api]\nlinks: related.md\n---\nBody\n",
        "feature.md",
    );

    assert_eq!(task.priority, Some(Priority::High));
    assert_eq!(task.labels, vec![Label::from("bug"), Label::from("api")]);
    assert_eq!(task.links, vec![TaskFilePath::from("related.md")]);
    assert_eq!(task.body, "Body\n");
}

#[test]
fn missing_title_uses_file_name_fallback_with_warning() {
    let task = task_from("---\nstatus: Todo\n---\n", "tasks/fix-login.md");

    assert_eq!(task.title, "fix login");
    assert_eq!(
        task.parse_warnings,
        vec![TaskWarning {
            code: TaskWarningCode::MissingTitleUsedFileName,
            field: Some("title".into()),
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
            task.parse_warnings,
            vec![TaskWarning {
                code: TaskWarningCode::InvalidTitleUsedFileName,
                field: Some("title".into()),
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
        task.parse_warnings,
        vec![TaskWarning {
            code: TaskWarningCode::MissingStatusUsedDefault,
            field: Some("status".into()),
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
        task.parse_warnings,
        vec![TaskWarning {
            code: TaskWarningCode::InvalidStatusUsedDefault,
            field: Some("status".into()),
            message: "status is invalid; default status was used".to_string(),
        }]
    );
}

#[test]
fn task_status_stays_lenient_at_the_frontmatter_boundary() {
    let strict_default = crate::config::column_name::ColumnName::try_from_str("Todo").unwrap();
    let context = TaskParseContext {
        file_path: PathBuf::from("tasks/fix-bug.md"),
        default_status: strict_default,
    };

    let explicit =
        task_from_markdown(b"---\ntitle: Fix bug\nstatus: Doing\n---\n", &context).unwrap();
    let fallback = task_from_markdown(b"---\ntitle: Fix bug\n---\n", &context).unwrap();

    assert!(!explicit.status.is_validated());
    assert!(!fallback.status.is_validated());
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

    assert_eq!(parent_task.parent, Some("tasks/parent.md".into()));
    assert_eq!(missing_parent_task.parent, None);
    assert_eq!(invalid_parent_task.parent, None);
    assert_eq!(
        invalid_parent_task.parse_warnings,
        vec![TaskWarning {
            code: TaskWarningCode::InvalidParentIgnored,
            field: Some("parent".into()),
            message: "parent is invalid; value was ignored".to_string(),
        }]
    );
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
        task.parse_warnings,
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
        task.parse_warnings,
        vec![TaskWarning {
            code: TaskWarningCode::ExtraValueNotJsonCompatible,
            field: Some("tagged".into()),
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
fn task_file_path_payload_is_relative_and_uses_forward_slashes() {
    let cases = [
        ("/project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
        ("C:\\project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
    ];

    for (input_path, expected_path) in cases {
        let task = task_from("---\ntitle: Fix bug\nstatus: Todo\n---\n", input_path);

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
fn milestone_is_transferred_to_task() {
    let task = task_from("---\ntitle: A\nmilestone: v0.3\n---\nbody\n", "a.md");
    assert_eq!(task.milestone.as_deref(), Some("v0.3"));
}

#[test]
fn milestone_is_excluded_from_extras() {
    // TYPED_KEYS（parse.rs 側）に milestone が含まれ、extras に二重流入しない。
    let task = task_from("---\ntitle: A\nmilestone: v0.3\n---\nbody\n", "a.md");
    assert!(!task.extras.contains_key("milestone"));
}

#[test]
fn milestone_absent_is_none() {
    let task = task_from("---\ntitle: A\n---\nbody\n", "a.md");
    assert_eq!(task.milestone, None);
}

fn has_invalid_due_warning(task: &ParsedTask) -> bool {
    task.parse_warnings
        .iter()
        .any(|w| w.code == TaskWarningCode::InvalidDue && w.field.as_deref() == Some("due"))
}

#[test]
fn valid_future_due_is_kept_without_warning() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: 2026-06-30\n---\n",
        "tasks/t.md",
    );

    assert_eq!(task.due.as_ref().map(|d| d.as_str()), Some("2026-06-30"));
    assert!(!has_invalid_due_warning(&task));
    assert_eq!(
        task.extras.get("due"),
        Some(&json!("2026-06-30")),
        "due also remains in extras for round-trip"
    );
}

#[test]
fn valid_past_due_is_kept_without_warning() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: 2020-01-01\n---\n",
        "tasks/t.md",
    );

    assert_eq!(task.due.as_ref().map(|d| d.as_str()), Some("2020-01-01"));
    assert!(!has_invalid_due_warning(&task));
}

#[test]
fn missing_due_key_is_none_without_warning() {
    let task = task_from("---\ntitle: T\nstatus: Todo\n---\n", "tasks/t.md");

    assert_eq!(task.due, None);
    assert!(!has_invalid_due_warning(&task));
}

#[test]
fn empty_due_is_treated_as_unset_without_warning() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: \"\"\n---\n",
        "tasks/t.md",
    );

    assert_eq!(task.due, None);
    assert!(!has_invalid_due_warning(&task));
}

#[test]
fn invalid_due_keeps_original_and_warns() {
    let cases = ["2026/6/30", "tomorrow", "2026-13-40", "2026-02-29"];
    for raw in cases {
        let task = task_from(
            &format!("---\ntitle: T\nstatus: Todo\ndue: \"{raw}\"\n---\n"),
            "tasks/t.md",
        );

        assert_eq!(
            task.due.as_ref().map(|d| d.as_str()),
            Some(raw),
            "{raw} should be kept verbatim"
        );
        assert!(has_invalid_due_warning(&task), "{raw} should warn");
    }
}

#[test]
fn valid_leap_year_due_is_kept_without_warning() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: 2024-02-29\n---\n",
        "tasks/t.md",
    );

    assert_eq!(task.due.as_ref().map(|d| d.as_str()), Some("2024-02-29"));
    assert!(!has_invalid_due_warning(&task));
}

#[test]
fn non_string_due_warns_and_is_none() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: 12345\n---\n",
        "tasks/t.md",
    );

    assert_eq!(task.due, None);
    assert!(has_invalid_due_warning(&task));
}

#[test]
fn task_from_markdown_maps_draft_true() {
    let task = task_from(
        "---\ntitle: A\nstatus: Todo\ndraft: true\n---\nbody\n",
        "tasks/a.md",
    );
    assert!(task.draft);
}

#[test]
fn task_from_markdown_maps_absent_draft_to_false() {
    let task = task_from("---\ntitle: A\nstatus: Todo\n---\nbody\n", "tasks/a.md");
    assert!(!task.draft);
}

#[test]
fn task_from_markdown_excludes_draft_from_extras() {
    let task = task_from(
        "---\ntitle: A\nstatus: Todo\ndraft: true\n---\nbody\n",
        "tasks/a.md",
    );
    assert!(!task.extras.contains_key("draft"));
}
