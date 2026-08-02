//! Task Form の markdown preview を生成する Tauri command。
//!
//! project state や file I/O を持たず、#455 の typed document renderer だけを呼び出す。

use serde::Deserialize;
use tauri::command;
use thiserror::Error;

use crate::task::document::{TaskDocument, TaskDocumentError, TaskDraft};
use crate::task::frontmatter::Priority;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTaskMarkdownArgs {
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    #[serde(default)]
    pub labels: Vec<String>,
    pub parent: Option<String>,
    #[serde(default)]
    pub links: Vec<String>,
    pub due: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Error)]
pub enum PreviewTaskMarkdownError {
    #[error(transparent)]
    Document(#[from] TaskDocumentError),
}

#[command]
pub fn preview_task_markdown(args: PreviewTaskMarkdownArgs) -> Result<String, String> {
    preview_task_markdown_impl(args).map_err(|error| error.to_string())
}

pub(crate) fn preview_task_markdown_impl(
    args: PreviewTaskMarkdownArgs,
) -> Result<String, PreviewTaskMarkdownError> {
    let document = TaskDocument::from_draft(TaskDraft {
        title: args.title,
        status: args.status,
        priority: args.priority.as_deref().and_then(Priority::from_ascii_ci),
        labels: args.labels,
        milestone: None,
        parent: args.parent,
        links: args.links,
        due: args.due,
        draft: args.draft,
        body: args.body,
    });

    Ok(document.render()?)
}

#[cfg(test)]
#[path = "preview_markdown_tests.rs"]
mod preview_markdown_tests;
