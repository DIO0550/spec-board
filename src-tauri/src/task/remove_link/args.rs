//! `remove_link` Tauri command の引数 DTO。
//!
//! sourceFilePath / targetFilePath は絶対パスまたは project_root 相対のいずれも
//! 受け、共通の path normalization helper で project_root 相対の正規形に倒す。

use std::path::{Component, Path, PathBuf};

use serde::Deserialize;

use crate::task::path_lookup::normalize_relative_path_for_input;
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
        let source = normalize_input_path(&self.source_file_path, project_root, true)?;
        let target = normalize_input_path(&self.target_file_path, project_root, false)?;
        Ok(RemoveLinkIntent { source, target })
    }
}

fn normalize_input_path(
    raw: &str,
    project_root: &Path,
    is_source: bool,
) -> Result<PathBuf, RemoveLinkError> {
    let make_err = |raw: &str| -> RemoveLinkError {
        if is_source {
            RemoveLinkError::SourceNotFound {
                path: raw.to_string(),
            }
        } else {
            RemoveLinkError::InvalidTargetPath {
                path: raw.to_string(),
            }
        }
    };

    if raw.trim().is_empty() {
        return Err(make_err(raw));
    }

    let candidate_text = if Path::new(raw).is_absolute() {
        Path::new(raw)
            .strip_prefix(project_root)
            .map_err(|_| make_err(raw))?
            .to_string_lossy()
            .into_owned()
    } else {
        raw.to_string()
    };

    let normalized =
        normalize_relative_path_for_input(&candidate_text).ok_or_else(|| make_err(raw))?;
    let rel = Path::new(&normalized);
    if rel.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(make_err(raw));
    }
    if rel.as_os_str().is_empty() {
        return Err(make_err(raw));
    }

    Ok(rel.to_path_buf())
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
