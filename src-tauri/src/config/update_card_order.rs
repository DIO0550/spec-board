//! `update_card_order` Tauri command 本体。
//!
//! フロントエンドの DnD 並び替え結果を `.spec-board/config.json` の
//! `cardOrder[columnName]` に**上書き保存**する書き込み専用 command。
//! `AppState::snapshot_project_and_config` で `project_path` と `config` を
//! atomic に snapshot → snapshot 上で上書き → disk write → `replace_config`
//! の順で進める。disk write が失敗した場合は `replace_config` を呼ばない
//! ため in-memory の `Config` は変更されない。
//!
//! # ロック取得順序
//!
//! `AppState` の lock 契約 `project_path → config → tasks_cache →
//! watcher_handle → write_ignore` の前半 2 項目のみを順に使用する。
//! 読み取り側は `snapshot_project_and_config` で `project_path` と `config`
//! を同時保持して snapshot し、書き戻し時のみ `config` lock を単独で
//! 短時間取得する。これにより `open_project` の commit が両者を更新する
//! 途中で割り込んで「新 path + 旧 config」を観測する race を防ぐ。
//!
//! # エラー文字列の契約
//!
//! - `UnknownColumn` の Display は `"カラムが見つかりません: {column_name}"`
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`
//! - `ConfigIo` の Display は `"config.json の書き込みに失敗しました: ..."`
//! - `Serialize` の Display は `"config.json のシリアライズに失敗しました: ..."`
//!
//! FE 側 `TauriError.PATTERNS` は `UnknownColumn` を `NOT_FOUND`、
//! `ConfigIo` を `IO_ERROR` 系（内側メッセージ次第で `NOT_FOUND` /
//! `PERMISSION_DENIED` に転ぶ）として扱う想定。

use std::sync::Arc;

use spec_board_fs::config::config_io::{write_config_json, ConfigIoError};
use tauri::State;
use thiserror::Error;

use crate::state::{AppState, AppStateError};

/// `update_card_order` コマンドのエラー。
///
/// `ConfigIoError` が `std::io::Error` を内包するため `PartialEq` / `Eq` は
/// derive しない。テストは `matches!` でバリアントを判定する。
#[derive(Debug, Error)]
pub enum UpdateCardOrderError {
    /// 指定された `column_name` が `Config.columns` に存在しない。
    #[error("カラムが見つかりません: {column_name}")]
    UnknownColumn { column_name: String },

    /// `AppState.config` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,

    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,

    /// `config.json` の書き込み失敗（disk full / permission / symlink 拒否など）。
    #[error("config.json の書き込みに失敗しました: {0}")]
    ConfigIo(#[from] ConfigIoError),

    /// `Config` の JSON シリアライズに失敗。
    #[error("config.json のシリアライズに失敗しました: {0}")]
    Serialize(#[from] serde_json::Error),
}

impl From<AppStateError> for UpdateCardOrderError {
    fn from(_: AppStateError) -> Self {
        UpdateCardOrderError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`update_card_order_impl` を呼び、エラーを文字列化して返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `UpdateCardOrderError` の
/// Display 文字列であり、FE 側でパターンマッチして `TauriError` に変換される。
#[tauri::command]
pub fn update_card_order(
    state: State<'_, Arc<AppState>>,
    column_name: String,
    file_paths: Vec<String>,
) -> Result<(), String> {
    update_card_order_impl(state.inner(), column_name, file_paths).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// 1. `snapshot_project_and_config` で `project_path` と `config` を
///    両 lock 同時保持下で atomic に取得（どちらかが `None` → `NoProjectOpen`）
/// 2. `column_name` が `Config.columns` に存在するか検証
/// 3. snapshot の `card_order[column_name]` を `file_paths` で上書き
/// 4. `serde_json::to_string_pretty` でシリアライズ
/// 5. `write_config_json` で disk に書き込み
/// 6. 成功したら `replace_config` で in-memory を更新
///
/// disk write 失敗時は `replace_config` を呼ばないため、in-memory の `Config` は
/// 呼び出し前の値のまま保たれる。
pub(crate) fn update_card_order_impl(
    state: &AppState,
    column_name: String,
    file_paths: Vec<String>,
) -> Result<(), UpdateCardOrderError> {
    // `project_path` と `config` を atomic に snapshot して、`open_project` の
    // 両者更新の間に割り込んで「新 path + 旧 config」を観測する race を防ぐ
    // （単独の `project_path()? → config()?` 連続呼びでは race window が生じる）。
    let (project_root, config) = state.snapshot_project_and_config()?;
    let project_root = project_root.ok_or(UpdateCardOrderError::NoProjectOpen)?;
    let mut config = config.ok_or(UpdateCardOrderError::NoProjectOpen)?;

    if !config.has_column(&column_name) {
        return Err(UpdateCardOrderError::UnknownColumn { column_name });
    }

    config.card_order.insert(column_name, file_paths);

    let json = serde_json::to_string_pretty(&config)?;
    write_config_json(&project_root, &json)?;

    state.replace_config(Some(config))?;

    Ok(())
}

#[cfg(test)]
#[path = "update_card_order_tests.rs"]
mod update_card_order_tests;
