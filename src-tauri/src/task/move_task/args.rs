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
    /// 移動先カラムが「移動前にこうであったはず」という並びの期待値。
    /// FE が drop 直前に見ていた表示順をそのまま送る。
    pub expected_to_column_order: Vec<String>,
}

impl MoveTaskArgs {
    /// project_root を起点に入力パスを lexical 正規化し、`MoveTaskIntent` に詰め直す。
    ///
    /// `to_column_file_paths` も 1 件ずつ同じ VO を通す。ここを素通しすると `..` や
    /// 絶対パス（`Path::join` は絶対パスを渡されると project_root を捨てる）が
    /// task I/O port の実在判定に使われ、さらに `config.json` の cardOrder へ
    /// そのまま永続化されてしまう。1 件でも解決できなければ移動全体を reject する
    /// （並びの一部を黙って捨てると、カードが理由なく消えたように見えるため）。
    pub(crate) fn into_intent(
        self,
        project_root: &Path,
    ) -> Result<MoveTaskIntent, MoveTaskCommandError> {
        let file_path = resolve_input_file_path(&self.file_path, project_root)?;
        let to_column_file_paths =
            resolve_input_file_paths(&self.to_column_file_paths, project_root)?;
        let expected_to_column_order =
            resolve_input_file_paths(&self.expected_to_column_order, project_root)?;

        Ok(MoveTaskIntent {
            file_path,
            from_column: self.from_column,
            to_column: self.to_column,
            to_column_file_paths,
            expected_to_column_order,
        })
    }
}

/// 入力パス列を 1 件ずつ正規化する。1 件でも解決できなければ全体を reject する。
///
/// 一部だけ黙って捨てると、照合が「本当は一致していたのに不一致」と判定したり、
/// 並びの一部が理由なく消えたように見えたりする。
fn resolve_input_file_paths(
    raws: &[String],
    project_root: &Path,
) -> Result<Vec<String>, MoveTaskCommandError> {
    raws.iter()
        .map(|raw| {
            resolve_input_file_path(raw, project_root)
                .map(|path| path.to_string_lossy().into_owned())
        })
        .collect()
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

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
