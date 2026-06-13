//! `update_card_order` Tauri command 本体。
//!
//! フロントエンドの DnD 並び替え結果を `.spec-board/config.json` の
//! `cardOrder[columnName]` に**上書き保存**する書き込み専用 command。
//! `AppState::snapshot_project_and_config` で `project_path` と `config` を
//! atomic に snapshot → snapshot 上で上書き → disk write →
//! `replace_config_if_project_matches` で `project_path` が snapshot 時と一致
//! する場合のみ in-memory `config` を更新、の順で進める。disk write が失敗した
//! 場合は `replace_config_if_project_matches` を呼ばないため in-memory の
//! `Config` は変更されない。並行 `open_project` で project が swap された
//! 場合も `project_path` 不一致により in-memory 更新は no-op になり、
//! cross-project corruption は発生しない（旧 project への disk write は
//! 旧 project 視点では整合的）。
//!
//! # ロック取得順序
//!
//! `AppState` の lock 契約 `project_path → config → tasks_cache →
//! watcher_handle → write_ignore` の前半 2 項目のみを順に使用する。
//! 読み取り側は `snapshot_project_and_config` で `project_path` と `config`
//! を同時保持して snapshot し、書き戻し時も `replace_config_if_project_matches`
//! で両 lock を同時保持して `project_path` の一致確認 + `config` 更新を行う。
//! これにより `open_project` の commit が両者を atomic に swap する間に
//! 「新 path + 旧 config」を観測する race と、snapshot 取得後の swap で
//! 旧 config を新プロジェクトの in-memory state に注入する race の双方を防ぐ。
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

use std::collections::HashSet;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use spec_board_fs::config::config_io::{write_config_json, ConfigIoError};
use tauri::State;
use thiserror::Error;

use crate::config::UpdateCardOrderPlanError;
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

impl From<UpdateCardOrderPlanError> for UpdateCardOrderError {
    fn from(err: UpdateCardOrderPlanError) -> Self {
        match err {
            UpdateCardOrderPlanError::UnknownColumn { column_name } => {
                UpdateCardOrderError::UnknownColumn { column_name }
            }
        }
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
/// 2. `file_paths` のうち実在するパス集合を fs 走査で求める（effect 層責務）
/// 3. `Config::plan_update_card_order` でカラム検証 + `cardOrder` 上書きを行い、
///    書き出し対象の新しい `Config` を得る（未知カラムは `UnknownColumn`）
/// 4. `serde_json::to_string_pretty` でシリアライズ
/// 5. `write_config_json` で disk に書き込み
/// 6. `replace_config_if_project_matches` で `project_path` が snapshot 時と
///    一致する場合のみ in-memory `config` を更新（不一致時は cross-project
///    corruption を避けるため no-op）
///
/// disk write 失敗時は `replace_config_if_project_matches` を呼ばないため、
/// in-memory の `Config` は呼び出し前の値のまま保たれる。
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
    let config = config.ok_or(UpdateCardOrderError::NoProjectOpen)?;

    // 実在判定（fs 走査）は effect 層の責務。除去ルール自体は aggregate に寄せる。
    let existing_paths = collect_existing_paths(&project_root, &file_paths);
    let config = config.plan_update_card_order(column_name, file_paths, &existing_paths)?;

    let json = serde_json::to_string_pretty(&config)?;
    write_config_json(&project_root, &json)?;

    // snapshot 取得後に並行 `open_project` で project が swap されると、
    // ここで旧プロジェクト由来の config を新プロジェクトの in-memory state に
    // 注入してしまう。`project_path` が snapshot 時と一致する場合のみ更新する
    // atomic check-and-set で cross-project corruption を防ぐ。
    // 不一致時の disk write 自体は旧 project の `.spec-board/config.json` に
    // 対する操作のため、旧 project 視点では整合的であり no-op で問題ない。
    state.replace_config_if_project_matches(&project_root, config)?;

    Ok(())
}

/// `file_paths` のうち `project_root` 配下で「保持すべき」パスの集合を返す。
///
/// 各パスを `project_root.join(rel)` で解決し `std::fs::metadata` で判定する。
/// `Err(NotFound)` のみ除外対象（集合に入れない）とし、`permission denied` など
/// 他の I/O エラーは、ユーザーのカード並びを誤って失わないために保守的に集合へ含める。
/// この集合は `Config::plan_update_card_order` の `existing_paths` 引数として渡し、
/// 実際の除去（および入力順の保持）は aggregate 側で行う。
fn collect_existing_paths(project_root: &Path, file_paths: &[String]) -> HashSet<String> {
    file_paths
        .iter()
        .filter(|rel| match std::fs::metadata(project_root.join(rel)) {
            Ok(_) => true,
            Err(e) => e.kind() != ErrorKind::NotFound,
        })
        .cloned()
        .collect()
}

#[cfg(test)]
#[path = "update_card_order_tests.rs"]
mod update_card_order_tests;
