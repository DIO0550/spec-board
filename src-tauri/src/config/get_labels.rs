//! `get_labels` Tauri command 本体。
//!
//! `AppState.labels` に commit 済みの `LabelRegistry` からラベル定義一覧を取得し、
//! FE のラベル表示用 payload として返す読み取り専用 command。`get_columns` と同じ
//! 3 段構成（payload 型 + `#[tauri::command]` 薄層 + `_impl`）を採用する。
//!
//! payload は labels.yml の定義順をそのまま保持する（並べ替えない）。labels.yml 不在
//! （= 空レジストリ・暗黙ラベル）でも `Ok(空配列)` を返す。プロジェクト未オープン
//! （`labels` が `None`）のときのみ `NoProjectOpen`。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`get_columns` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）

use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::config::LabelDefinition;
use crate::state::{AppState, AppStateError};

/// `get_labels` コマンドが FE へ返す payload。
///
/// 各定義は name / description / group / color / updated を含み、labels.yml の定義順を保持する。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLabelsPayload {
    pub labels: Vec<LabelDefinition>,
}

/// `get_labels` コマンドのエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetLabelsError {
    /// `AppState.labels` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex (`labels`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetLabelsError {
    fn from(_: AppStateError) -> Self {
        GetLabelsError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`get_labels_impl` を呼び、エラーを文字列化して返す。
///
/// # Errors
///
/// - プロジェクト未オープン時に `"プロジェクトが開かれていません"`
/// - `labels` の `Mutex` が poison している場合に `"内部状態のロックが破損しました"`
#[tauri::command]
pub fn get_labels(state: State<'_, Arc<AppState>>) -> Result<GetLabelsPayload, String> {
    get_labels_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。`AppState.labels` から payload を組む。
///
/// labels.yml 不在 = 空レジストリ（暗黙ラベル）でも `Ok(空配列)`。
/// プロジェクト未オープン（labels が `None`）のみ `NoProjectOpen`。
///
/// # Errors
///
/// - `AppState.labels` が `None` の場合 `GetLabelsError::NoProjectOpen`
/// - `labels` の `Mutex` が poison している場合 `GetLabelsError::StateLockPoisoned`
pub(crate) fn get_labels_impl(state: &AppState) -> Result<GetLabelsPayload, GetLabelsError> {
    let registry = state.labels()?.ok_or(GetLabelsError::NoProjectOpen)?;
    Ok(GetLabelsPayload {
        labels: registry.labels,
    })
}

#[cfg(test)]
#[path = "get_labels_tests.rs"]
mod get_labels_tests;
