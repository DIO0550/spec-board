//! `archive_task` / `unarchive_task` の IPC 引数 DTO。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::archive::error::ArchiveTaskError;
use crate::task::input_task_path::InputTaskPath;

/// FE 側 `ArchiveTaskParams` と整合する IPC 引数 DTO。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTaskArgs {
    /// アーカイブ対象タスクのファイルパス（絶対または project_root 相対）。
    pub file_path: String,
}

/// FE 側 `UnarchiveTaskParams` と整合する IPC 引数 DTO。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnarchiveTaskArgs {
    /// 復元対象のアーカイブ内相対パス（アーカイブ時の元 project_root 相対パス）。
    pub file_path: String,
}

/// `file_path` を `InputTaskPath` で正規化し project_root 相対パスへ解決する。
///
/// アーカイブ内相対パスも「project_root 相対のタスクパス」と同じ字形（`../` 禁止・
/// `.md` 拡張子）のため、archive / unarchive の両方で同じ検証を共有する。
pub(crate) fn resolve_input_file_path(
    raw: &str,
    project_root: &Path,
) -> Result<PathBuf, ArchiveTaskError> {
    if raw.trim().is_empty() {
        return Err(ArchiveTaskError::InvalidPath("empty".into()));
    }
    InputTaskPath::resolve(raw, project_root, true)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| ArchiveTaskError::InvalidPath(raw.into()))
}
