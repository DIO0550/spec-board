//! `move_task` Tauri command の引数 DTO。
//!
//! filePath は共通の入力パス VO で正規化して `MoveTaskIntent` に詰め直す。
//! canonicalize は使わない。

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::task::input_task_path::InputTaskPath;
use crate::task::move_task::error::MoveTaskCommandError;
use crate::task::task_index::MoveTaskIntent;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveTaskArgs {
    /// 移動対象タスクのファイルパス。絶対パスまたは project_root 相対。
    pub file_path: String,
    /// 移動元カラム名。移動前の status の期待値として検証に使う。
    pub from_column: String,
    /// 移動先カラム名。
    pub to_column: String,
    /// 移動先カラムの新しい cardOrder。FE がドロップ位置を反映した完全な並びを送る。
    pub to_column_file_paths: Vec<String>,
}

impl MoveTaskArgs {
    /// project_root を起点に filePath を lexical 正規化し、`MoveTaskIntent` に詰め直す。
    pub(crate) fn into_intent(
        self,
        project_root: &Path,
    ) -> Result<MoveTaskIntent, MoveTaskCommandError> {
        let file_path = resolve_input_file_path(&self.file_path, project_root)?;

        Ok(MoveTaskIntent {
            file_path,
            from_column: self.from_column,
            to_column: self.to_column,
            to_column_file_paths: self.to_column_file_paths,
        })
    }
}

/// 入力 filePath を VO で `.md` 必須として正規化し、reject を `InvalidPath` へ詰め替える。
///
/// 空文字 / 空白のみの入力は、`update_task` と同じく raw ではなく `"empty"` を
/// 持つ `InvalidPath` にして FE 側の文字列マッチ契約を揃える。
fn resolve_input_file_path(
    raw: &str,
    project_root: &Path,
) -> Result<PathBuf, MoveTaskCommandError> {
    if raw.trim().is_empty() {
        return Err(MoveTaskCommandError::InvalidPath("empty".into()));
    }

    InputTaskPath::resolve(raw, project_root, true)
        .map(InputTaskPath::into_path_buf)
        .map_err(|_| MoveTaskCommandError::InvalidPath(raw.into()))
}
