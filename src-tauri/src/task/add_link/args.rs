//! `add_link` Tauri command の引数 DTO。
//!
//! sourceFilePath / targetFilePath は絶対パスまたは project_root 相対のいずれも
//! 受け、共通の入力パス VO で project_root 相対の正規形に倒す。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::add_link::error::AddLinkError;
use crate::task::input_task_path::InputTaskPath;
use crate::task::task_index::AddLinkIntent;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddLinkArgs {
    pub source_file_path: String,
    pub target_file_path: String,
}

impl AddLinkArgs {
    /// project_root を起点に sourceFilePath / targetFilePath を lexical 正規化し、
    /// `AddLinkIntent` に詰め直す。
    pub fn into_intent(self, project_root: &Path) -> Result<AddLinkIntent, AddLinkError> {
        let source = resolve_input_path(&self.source_file_path, project_root, true)?;
        let target = resolve_input_path(&self.target_file_path, project_root, false)?;
        Ok(AddLinkIntent { source, target })
    }
}

/// 入力 path を VO で正規化し、reject を source / target に応じたエラーへ詰め替える。
fn resolve_input_path(
    raw: &str,
    project_root: &Path,
    is_source: bool,
) -> Result<PathBuf, AddLinkError> {
    InputTaskPath::resolve(raw, project_root, false)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| {
            if is_source {
                AddLinkError::SourceNotFound {
                    path: raw.to_string(),
                }
            } else {
                AddLinkError::TargetNotFound {
                    path: raw.to_string(),
                }
            }
        })
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
