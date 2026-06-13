//! `update_task` Tauri command の引数 DTO。
//!
//! filePath は共通の入力パス VO で正規化して `UpdateTaskIntent` に詰め直す。
//! canonicalize は使わない。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::frontmatter::Priority;
use crate::task::input_task_path::InputTaskPath;
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
    /// draft の更新意図（3 値）: 未指定 = 不変 / `Some(true)` = draft 化 / `Some(false)` = 解除。
    pub draft: Option<bool>,
}

impl UpdateTaskArgs {
    /// project_root を起点に filePath を lexical 正規化し、`UpdateTaskIntent` に詰め直す。
    pub fn into_intent(self, project_root: &Path) -> Result<UpdateTaskIntent, UpdateTaskError> {
        let rel_path = resolve_input_file_path(&self.file_path, project_root)?;

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
            draft: self.draft,
        })
    }
}

/// 入力 filePath を VO で `.md` 必須として正規化し、reject を `InvalidPath` へ詰め替える。
///
/// 空文字 / 空白のみの入力は、既存の FE 文字列マッチ契約を維持するため
/// raw ではなく `"empty"` を持つ `InvalidPath` にする。
fn resolve_input_file_path(raw: &str, project_root: &Path) -> Result<PathBuf, UpdateTaskError> {
    if raw.trim().is_empty() {
        return Err(UpdateTaskError::InvalidPath("empty".into()));
    }

    InputTaskPath::resolve(raw, project_root, true)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| UpdateTaskError::InvalidPath(raw.into()))
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
