//! `get_columns` Tauri command 本体。
//!
//! `AppState.config` に commit 済みの `Config` から columns 一覧と doneColumn
//! 名を取得し、FE のボードビュー描画用 payload として返す読み取り専用 command。
//! `open_project` で commit された state を消費する後続 API としての位置付け
//! で、`get_tasks` と同じ 3 段構成（エラー型 + Tauri 薄層 + impl）を採用する。
//!
//! columns は `order` 昇順 sort して返す（FE は受け取った順を表示順とする）。
//! doneColumn は `Config::resolved_done_column()` を通じて、`done_column`
//! 未設定時は `order` 最大カラム名へフォールバックさせ、必須 `String` で返す。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`
//!
//! `StateLockPoisoned` は `OpenProjectError` / `GetTasksError` と完全一致させる。
//! FE 側 `TauriError.PATTERNS` 未対応のため `UNKNOWN` 分類になる。

use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use super::Column;
use crate::state::{AppState, AppStateError};

/// `get_columns` コマンドが FE へ返す payload。
///
/// `columns` は `order` 昇順 sort 済み。`doneColumn` は
/// `Config::resolved_done_column()` を通じて解決された **必須**カラム名。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetColumnsPayload {
    pub columns: Vec<Column>,
    pub done_column: String,
}

/// `get_columns` コマンドのエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetColumnsError {
    /// `AppState.config` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex (`config`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetColumnsError {
    fn from(_: AppStateError) -> Self {
        GetColumnsError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`get_columns_impl` を呼び、エラーを文字列化して返す。
///
/// # Errors
///
/// - プロジェクト未オープン時に `"プロジェクトが開かれていません"`
/// - `config` の `Mutex` が poison している場合に
///   `"内部状態のロックが破損しました"`
#[tauri::command]
pub fn get_columns(state: State<'_, Arc<AppState>>) -> Result<GetColumnsPayload, String> {
    get_columns_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// `AppState::config` から `Config` を取得し、columns を `order` 昇順に sort、
/// doneColumn を `Config::resolved_done_column()` で解決して payload を組み立てる。
///
/// # Errors
///
/// - `AppState.config` が `None` の場合 `GetColumnsError::NoProjectOpen`
/// - `config` の `Mutex` が poison している場合 `GetColumnsError::StateLockPoisoned`
pub(crate) fn get_columns_impl(state: &AppState) -> Result<GetColumnsPayload, GetColumnsError> {
    let snapshot = state
        .session_snapshot()?
        .ok_or(GetColumnsError::NoProjectOpen)?;
    let config = snapshot.config();

    // columns 非空は `Config` aggregate 側の不変条件として
    // `Config::load_or_default` が `EmptyColumns` で担保している。
    // `replace_config` 経由で空注入された場合は不変条件違反のため即時 panic で
    // 検出する（`resolved_done_column()` は done_column=Some なら columns 空でも
    // Some を返すため、空 columns チェックを独立に行う必要がある）。
    assert!(
        !config.columns.is_empty(),
        "config invariant violation: columns must be non-empty"
    );

    let done_column = config
        .resolved_done_column()
        .expect(
            "config invariant violation: done column must be resolvable when columns is non-empty",
        )
        .as_str()
        .to_string();

    let mut columns = config.columns.clone();
    columns.sort_by_key(|column| column.order);

    Ok(GetColumnsPayload {
        columns,
        done_column,
    })
}

#[cfg(test)]
#[path = "get_columns_tests.rs"]
mod get_columns_tests;
