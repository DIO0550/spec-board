//! `get_labels` Tauri command 本体。
//!
//! `AppState.labels` に commit 済みの `LabelRegistry` からラベル定義一覧を取得し、
//! 各ラベルの使用数（`tasks_cache` から算出）と合わせて FE のラベル表示用 payload として
//! 返す読み取り専用 command。`get_columns` と同じ 3 段構成（payload 型 +
//! `#[tauri::command]` 薄層 + `_impl`）を採用する。
//!
//! payload は labels.yml の定義順をそのまま保持する（並べ替えない）。labels.yml 不在
//! （= 空レジストリ・暗黙ラベル）でも `Ok(空配列)` を返す。プロジェクト未オープン
//! （`labels` が `None`）のときのみ `NoProjectOpen`。
//!
//! ドメイン定義（labels.yml 由来の `LabelDefinition`）と派生値（使用数）は 1 つの
//! オブジェクトに混ぜず、`labels` / `usage_counts` の別フィールドで返す。使用数集計は
//! task 集約 [`TaskIndex::label_usage_counts`] に委譲し、依存方向を label/config → task の
//! 一方向に保つ。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`get_columns` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::config::LabelDefinition;
use crate::state::{AppState, AppStateError};
use crate::task::task_index::TaskIndex;

/// `get_labels` コマンドが FE へ返す payload。
///
/// `labels` は labels.yml 由来のドメイン定義（name / description / group / color /
/// updated）を定義順で保持する。`usage_counts` はラベル名 → 使用タスク件数のマップで、
/// task 集約由来のため registry 未定義の暗黙ラベルのキーも含み得る（FE は `labels[].name`
/// で引くため余分なキーは無害）。定義と派生値を型レベルで分離する（flatten しない）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLabelsPayload {
    pub labels: Vec<LabelDefinition>,
    pub usage_counts: HashMap<String, usize>,
}

/// `get_labels` コマンドのエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetLabelsError {
    /// `AppState.labels` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex (`labels` / `tasks_cache`) が poison 状態。
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
/// - `labels` / `tasks_cache` の `Mutex` が poison している場合に `"内部状態のロックが破損しました"`
#[tauri::command]
pub fn get_labels(state: State<'_, Arc<AppState>>) -> Result<GetLabelsPayload, String> {
    get_labels_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。`AppState.labels` と `tasks_cache` から payload を組む。
///
/// labels.yml 不在 = 空レジストリ（暗黙ラベル）でも `Ok(空配列)`。プロジェクト未オープン
/// （labels が `None`）のみ `NoProjectOpen`。使用数集計は表示用のため eventual consistency を
/// 許容する（labels と tasks の取得は同一トランザクションにしない）。
///
/// # Errors
///
/// - `AppState.labels` が `None` の場合 `GetLabelsError::NoProjectOpen`
/// - `labels` / `tasks_cache` の `Mutex` が poison している場合 `GetLabelsError::StateLockPoisoned`
pub(crate) fn get_labels_impl(state: &AppState) -> Result<GetLabelsPayload, GetLabelsError> {
    let snapshot = state
        .session_snapshot()?
        .ok_or(GetLabelsError::NoProjectOpen)?;
    let tasks = snapshot.tasks().values().cloned().collect();
    // 集計は task 集約 TaskIndex のメソッドへ委譲（free function を config 側に作らない）。
    let usage_counts = TaskIndex::new(tasks).label_usage_counts();
    Ok(GetLabelsPayload {
        labels: snapshot.labels().definitions().to_vec(),
        usage_counts,
    })
}

#[cfg(test)]
#[path = "get_labels_tests.rs"]
mod get_labels_tests;
