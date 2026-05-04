use crate::frontmatter::{parse_bytes, FrontmatterError, Parsed, Priority};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub type TaskExtras = BTreeMap<String, serde_json::Value>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskWarningCode {
    MissingTitleUsedFileName,
    InvalidTitleUsedFileName,
    MissingStatusUsedDefault,
    InvalidStatusUsedDefault,
    InvalidParentIgnored,
    NonStringExtraKeyIgnored,
    ExtraValueNotJsonCompatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWarning {
    pub code: TaskWarningCode,
    pub field: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub links: Vec<String>,
    pub children: Vec<String>,
    pub reverse_links: Vec<String>,
    pub body: String,
    pub extras: TaskExtras,
    pub warnings: Vec<TaskWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskParseContext {
    pub file_path: PathBuf,
    pub default_status: String,
}

#[derive(Debug, Error)]
pub enum TaskParseError {
    #[error("frontmatter was not found")]
    NotTask,
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

/// Markdown bytes and parse contextから Task を生成する。
///
/// @param input UTF-8 Markdown bytes。
/// @param context file path と status fallback を持つ変換 context。
/// @returns 生成された Task。frontmatter が無い場合は `TaskParseError::NotTask`。
pub fn task_from_markdown(
    input: &[u8],
    context: &TaskParseContext,
) -> Result<Task, TaskParseError> {
    let Some(parsed) = parse_bytes(input)? else {
        return Err(TaskParseError::NotTask);
    };
    Ok(task_from_parsed(parsed, context))
}

/// Parsed frontmatter と parse context から Task を生成する。
///
/// @param parsed `frontmatter::parse_bytes` 由来の Parsed。
/// @param context file path と status fallback を持つ変換 context。
/// @returns fallback と warning を反映した Task。
pub fn task_from_parsed(parsed: Parsed, context: &TaskParseContext) -> Task {
    let mut warnings = Vec::new();
    let title = extract_title(&parsed, context, &mut warnings);
    let status = extract_status(&parsed, context, &mut warnings);
    let parent = extract_parent(&parsed, &mut warnings);
    let extras = convert_extras(&parsed, &mut warnings);
    let file_path = context.file_path.to_string_lossy().to_string();

    Task {
        id: file_path.clone(),
        file_path,
        title,
        status,
        priority: parsed.frontmatter.priority,
        labels: parsed.frontmatter.labels,
        parent,
        links: parsed.frontmatter.links,
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: parsed.body,
        extras,
        warnings,
    }
}

fn extract_title(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> String {
    match extract_string_extra(&parsed.frontmatter.extras, "title") {
        Ok(Some(title)) if !title.is_empty() => title,
        Ok(Some(_)) | Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidTitleUsedFileName,
                Some("title"),
                "title is invalid; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingTitleUsedFileName,
                Some("title"),
                "title is missing; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
    }
}

fn extract_status(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> String {
    match extract_string_extra(&parsed.frontmatter.extras, "status") {
        Ok(Some(status)) => status,
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidStatusUsedDefault,
                Some("status"),
                "status is invalid; default status was used",
            ));
            context.default_status.clone()
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingStatusUsedDefault,
                Some("status"),
                "status is missing; default status was used",
            ));
            context.default_status.clone()
        }
    }
}

fn extract_parent(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> Option<String> {
    match extract_string_extra(&parsed.frontmatter.extras, "parent") {
        Ok(parent) => parent,
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidParentIgnored,
                Some("parent"),
                "parent is invalid; value was ignored",
            ));
            None
        }
    }
}

fn convert_extras(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> TaskExtras {
    const TYPED_KEYS: [&str; 6] = ["title", "status", "priority", "labels", "parent", "links"];
    let mut extras = BTreeMap::new();

    for (key, value) in &parsed.frontmatter.extras {
        let serde_yaml_ng::Value::String(key) = key else {
            warnings.push(warning(
                TaskWarningCode::NonStringExtraKeyIgnored,
                None,
                "non-string extra key was ignored",
            ));
            continue;
        };

        if TYPED_KEYS.contains(&key.as_str()) {
            continue;
        }

        let Some(json_value) = yaml_value_to_json(value) else {
            warnings.push(warning(
                TaskWarningCode::ExtraValueNotJsonCompatible,
                Some(key),
                "extra value is not JSON compatible; value was ignored",
            ));
            continue;
        };

        extras.insert(key.clone(), json_value);
    }

    extras
}

fn warning(code: TaskWarningCode, field: Option<&str>, message: &str) -> TaskWarning {
    TaskWarning {
        code,
        field: field.map(str::to_string),
        message: message.to_string(),
    }
}

fn extract_string_extra(extras: &serde_yaml_ng::Mapping, key: &str) -> Result<Option<String>, ()> {
    let Some(value) = extras.get(key) else {
        return Ok(None);
    };
    let serde_yaml_ng::Value::String(s) = value else {
        return Err(());
    };
    Ok(Some(s.clone()))
}

fn title_fallback_from_file_path(path: &Path) -> String {
    let Some(stem) = path.file_stem() else {
        return "Untitled".to_string();
    };
    let title = stem.to_string_lossy().replace('-', " ");
    if title.is_empty() {
        return "Untitled".to_string();
    }
    title
}

fn yaml_value_to_json(value: &serde_yaml_ng::Value) -> Option<serde_json::Value> {
    if matches!(value, serde_yaml_ng::Value::Tagged(_)) {
        return None;
    }
    serde_json::to_value(value).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frontmatter::{Frontmatter, Priority};
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
        let missing_parent_task =
            task_from("---\ntitle: Root\nstatus: Todo\n---\n", "tasks/root.md");
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
}
