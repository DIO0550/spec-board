//! `update_task` Tauri command の引数 DTO。
//!
//! filePath は既存の path-normalization helper を再利用して
//! `UpdateTaskIntent` に詰め直す。canonicalize は使わない。

use std::path::{Component, Path, PathBuf};

use serde::Deserialize;

use crate::task::frontmatter::Priority;
use crate::task::path_lookup::normalize_relative_path_for_input;
use crate::task::task_index::UpdateTaskIntent;
use crate::task::update::error::UpdateTaskError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskArgs {
    /// 対象タスクのファイルパス。絶対パスまたは project_root 相対。
    pub file_path: String,
    pub title: Option<String>,
    pub status: Option<String>,
    /// `"High" | "Medium" | "Low"` 想定。不正値は `None` に倒す lenient 変換。
    /// `None` = 未指定（不変）。priority クリアは本 Issue ではサポートしない。
    pub priority: Option<String>,
    /// マイルストーンの更新意図（既存 parent と同型の 3 値）:
    /// `None` = 不変 / `Some("")` = クリア / `Some(name)` = 設定。
    pub milestone: Option<String>,
    pub labels: Option<Vec<String>>,
    /// 空文字で親解除、`None` で不変、`Some(path)` で上書き。
    pub parent: Option<String>,
    pub body: Option<String>,
}

impl UpdateTaskArgs {
    /// project_root を起点に filePath を lexical 正規化し、`UpdateTaskIntent` に詰め直す。
    pub fn into_intent(self, project_root: &Path) -> Result<UpdateTaskIntent, UpdateTaskError> {
        let rel_path = normalize_input_file_path(&self.file_path, project_root)?;

        let priority = self.priority.as_deref().and_then(Priority::from_ascii_ci);

        Ok(UpdateTaskIntent {
            file_path: rel_path,
            title: self.title,
            status: self.status,
            priority,
            milestone: self.milestone,
            labels: self.labels,
            parent: self.parent,
            body: self.body,
        })
    }
}

fn normalize_input_file_path(raw: &str, project_root: &Path) -> Result<PathBuf, UpdateTaskError> {
    if raw.trim().is_empty() {
        return Err(UpdateTaskError::InvalidPath("empty".into()));
    }

    let candidate_text = if Path::new(raw).is_absolute() {
        Path::new(raw)
            .strip_prefix(project_root)
            .map_err(|_| UpdateTaskError::InvalidPath(raw.into()))?
            .to_string_lossy()
            .into_owned()
    } else {
        raw.to_string()
    };

    let normalized = normalize_relative_path_for_input(&candidate_text)
        .ok_or_else(|| UpdateTaskError::InvalidPath(raw.into()))?;

    let rel = Path::new(&normalized);

    if rel.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(UpdateTaskError::InvalidPath(raw.into()));
    }

    if rel.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err(UpdateTaskError::InvalidPath(raw.into()));
    }

    if rel.as_os_str().is_empty() {
        return Err(UpdateTaskError::InvalidPath(raw.into()));
    }

    Ok(rel.to_path_buf())
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
