//! `remove_link` Tauri command の引数 DTO。
//!
//! sourceFilePath / targetFilePath は絶対パスまたは project_root 相対のいずれも
//! 受け、共通の入力パス VO で project_root 相対の正規形に倒す。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::input_task_path::InputTaskPath;
use crate::task::remove_link::error::RemoveLinkError;
use crate::task::task_index::RemoveLinkIntent;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveLinkArgs {
    pub source_file_path: String,
    pub target_file_path: String,
}

impl RemoveLinkArgs {
    /// project_root を起点に sourceFilePath / targetFilePath を lexical 正規化し、
    /// `RemoveLinkIntent` に詰め直す。
    ///
    /// source の検証失敗は `SourceNotFound`、target の検証失敗は
    /// `InvalidTargetPath` を返す（add_link と異なり target は aggregate での
    /// 存在検証を行わないため、不正 path はここで一元的に弾く）。
    pub fn into_intent(self, project_root: &Path) -> Result<RemoveLinkIntent, RemoveLinkError> {
        let source = resolve_input_path(&self.source_file_path, project_root, true)?;
        let target = resolve_input_path(&self.target_file_path, project_root, false)?;
        Ok(RemoveLinkIntent { source, target })
    }
}

/// 入力 path を VO で正規化し、reject を source / target に応じたエラーへ詰め替える。
fn resolve_input_path(
    raw: &str,
    project_root: &Path,
    is_source: bool,
) -> Result<PathBuf, RemoveLinkError> {
    InputTaskPath::resolve(raw, project_root, false)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| {
            if is_source {
                RemoveLinkError::SourceNotFound {
                    path: raw.to_string(),
                }
            } else {
                RemoveLinkError::InvalidTargetPath {
                    path: raw.to_string(),
                }
            }
        })
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
