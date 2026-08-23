//! resolved Task から IPC JSON へ投影する出力専用 DTO。

use std::collections::BTreeMap;

#[cfg(test)]
use serde::Deserialize;
use serde::Serialize;

use crate::config::column_name::ColumnName;
use crate::task::due::Due;
use crate::task::frontmatter::Priority;
use crate::task::label::Label;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::task_title::TaskTitle;
use crate::task::warning::TaskWarning;

/// FE と watcher event が共有する flat camelCase task payload。
///
/// `Deserialize` は共有 wire fixture の互換検証専用であり、domain [`Task`] への
/// 変換経路は提供しない。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(Deserialize))]
#[serde(rename_all = "camelCase")]
pub struct TaskPayload {
    pub id: TaskFilePath,
    pub file_path: TaskFilePath,
    pub title: TaskTitle,
    pub status: ColumnName,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
    pub labels: Vec<Label>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<TaskFilePath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<Due>,
    #[serde(skip_serializing_if = "is_false", default)]
    pub draft: bool,
    pub links: Vec<TaskFilePath>,
    pub children: Vec<TaskFilePath>,
    pub reverse_links: Vec<TaskFilePath>,
    pub body: String,
    pub extras: BTreeMap<String, serde_json::Value>,
    pub warnings: Vec<TaskWarning>,
}

impl From<&Task> for TaskPayload {
    fn from(task: &Task) -> Self {
        Self {
            id: task.id().clone(),
            file_path: task.file_path().clone(),
            title: task.title().clone(),
            status: task.status().clone(),
            priority: task.priority(),
            milestone: task.milestone().map(str::to_owned),
            labels: task.labels().to_vec(),
            parent: task.parent().cloned(),
            due: task.due().cloned(),
            draft: task.is_draft(),
            links: task.links().to_vec(),
            children: task.children().to_vec(),
            reverse_links: task.reverse_links().to_vec(),
            body: task.body().to_owned(),
            extras: task.extras().clone(),
            warnings: task.warnings(),
        }
    }
}

impl From<Task> for TaskPayload {
    fn from(task: Task) -> Self {
        Self::from(&task)
    }
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::TaskPayload;
    use crate::task::canonical_task_path::CanonicalTaskPath;
    use crate::task::parse::{task_from_markdown, TaskParseContext};
    use crate::task::task_index::ResolvedTaskSet;
    use crate::task::warning::TaskWarningCode;

    #[test]
    fn payload_orders_parse_warnings_before_graph_warnings() {
        let context = TaskParseContext {
            file_path: PathBuf::from("tasks/a.md"),
            default_status: "Todo".into(),
        };
        let candidate = task_from_markdown(
            b"---\nstatus: Todo\nparent: tasks/missing.md\n---\n",
            &context,
        )
        .expect("fixture markdown parses");
        let tasks = ResolvedTaskSet::resolve_lenient(vec![candidate])
            .expect("missing parent is a recoverable graph warning");
        let task = tasks
            .get(&CanonicalTaskPath::new("tasks/a.md"))
            .expect("resolved task");
        let payload = TaskPayload::from(task);

        assert_eq!(
            payload
                .warnings
                .iter()
                .map(|warning| &warning.code)
                .collect::<Vec<_>>(),
            vec![
                &TaskWarningCode::MissingTitleUsedFileName,
                &TaskWarningCode::ParentNotFound,
            ]
        );

        let value = serde_json::to_value(payload).expect("payload serializes");
        assert_eq!(
            value["warnings"]
                .as_array()
                .expect("warnings array")
                .iter()
                .map(|warning| warning["code"].as_str().expect("warning code"))
                .collect::<Vec<_>>(),
            vec!["missingTitleUsedFileName", "parentNotFound"]
        );
    }
}
