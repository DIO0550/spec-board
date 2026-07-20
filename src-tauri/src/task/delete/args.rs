use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::delete::error::DeleteTaskError;
use crate::task::input_task_path::InputTaskPath;

/// FE 側 `DeleteTaskParams` と整合する IPC 引数 DTO。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTaskArgs {
    pub file_path: String,
    pub orphan_strategy: Option<String>,
}

/// 正規化済みの delete 意図。
pub(crate) struct DeleteTaskIntent {
    pub file_path: PathBuf,
}

impl DeleteTaskArgs {
    /// `file_path` を `InputTaskPath` で正規化し、`DeleteTaskIntent` に変換する。
    pub(crate) fn into_intent(
        self,
        project_root: &Path,
    ) -> Result<DeleteTaskIntent, DeleteTaskError> {
        let rel_path = resolve_input_file_path(&self.file_path, project_root)?;
        Ok(DeleteTaskIntent {
            file_path: rel_path,
        })
    }
}

fn resolve_input_file_path(raw: &str, project_root: &Path) -> Result<PathBuf, DeleteTaskError> {
    if raw.trim().is_empty() {
        return Err(DeleteTaskError::InvalidPath("empty".into()));
    }
    InputTaskPath::resolve(raw, project_root, true)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| DeleteTaskError::InvalidPath(raw.into()))
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
