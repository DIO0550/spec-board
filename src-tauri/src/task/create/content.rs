//! Frontmatter + body を組み立て、scanner eligible な `TaskContent` を返す。

use super::args::CreateTaskArgs;
use super::error::{ContentRejectReason, CreateTaskError};
use crate::task::frontmatter::{serialize as serialize_frontmatter, Frontmatter, Parsed, Priority};
use crate::task::task_content::{TaskContent, TaskContentError};

/// frontmatter + body を組み立て、構築失敗（サイズ超過 / NUL byte 含有）は
/// `CreateTaskError::ContentNotScannerEligible` に詰め直す。
pub(crate) fn build_task_content(
    args: &CreateTaskArgs,
    resolved_parent_path: Option<&str>,
) -> Result<TaskContent, CreateTaskError> {
    let raw = render_markdown(args, resolved_parent_path);
    TaskContent::try_new(raw).map_err(|err| match err {
        TaskContentError::TooLarge { size, .. } => CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { size },
        },
        TaskContentError::BinaryDetected { .. } => CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        },
    })
}

fn render_markdown(args: &CreateTaskArgs, resolved_parent_path: Option<&str>) -> String {
    use serde_yaml_ng::{Mapping, Value};

    let mut extras = Mapping::new();
    extras.insert(
        Value::String("title".into()),
        Value::String(args.title.clone()),
    );
    extras.insert(
        Value::String("status".into()),
        Value::String(args.status.clone()),
    );
    if let Some(parent_path) = resolved_parent_path {
        extras.insert(
            Value::String("parent".into()),
            Value::String(parent_path.to_string()),
        );
    }

    let priority = args.priority.as_deref().and_then(Priority::from_ascii_ci);

    let frontmatter = Frontmatter {
        priority,
        labels: args.labels.clone(),
        links: Vec::new(),
        extras,
    };

    let body = match args.body.as_deref() {
        Some(b) if !b.is_empty() => format!("\n{b}"),
        _ => String::new(),
    };

    serialize_frontmatter(&Parsed { frontmatter, body })
}

#[cfg(test)]
#[path = "content_tests.rs"]
mod content_tests;
