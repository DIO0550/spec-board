//! `get_tasks` Tauri command 本体。
//!
//! `AppState.tasks_cache` に格納済みの `Task` 一覧を取得し、`TaskIndex` aggregate
//! に並び順の決定を委譲して返す純粋な読み取り専用 command。`open_project` で
//! commit された state を消費する後続 API としての位置付け。並び順の契約
//! （id 昇順）は `TaskIndex::sorted_by_id` 側に集約する。
//!
//! # 構成
//!
//! - `GetTasksError`: FE へ返すエラー（`StateLockPoisoned` のみ）
//! - `get_tasks`: `#[tauri::command]` シン
//! - `get_tasks_impl`: 単体テストの境界となる本体関数
//!
//! # エラー文字列の契約
//!
//! `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"` で、
//! `OpenProjectError::StateLockPoisoned` と完全一致させる。FE 側
//! `TauriError.PATTERNS` 未対応のため `UNKNOWN` 分類になる。

use std::sync::Arc;

use tauri::State;
use thiserror::Error;

use super::task_index::{Task, TaskIndex};
use crate::state::{AppState, AppStateError};

/// `get_tasks` コマンドのエラー。
///
/// `tasks_cache` の lock 取得時に poison が確定している場合のみ返る。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetTasksError {
    /// `AppState` 内部 mutex (`tasks_cache`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetTasksError {
    fn from(_: AppStateError) -> Self {
        GetTasksError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`get_tasks_impl` を呼び、エラーを文字列化して返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `GetTasksError` の Display 文字列。
///
/// # Errors
///
/// `tasks_cache` の `Mutex` が poison している場合に
/// `"内部状態のロックが破損しました"` を返す。
#[tauri::command]
pub fn get_tasks(state: State<'_, Arc<AppState>>) -> Result<Vec<Task>, String> {
    get_tasks_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// `AppState::tasks_snapshot` で `Vec<Task>` を取得し、`TaskIndex` aggregate に
/// 並び順の決定を委譲した結果を返す。`tasks_cache` が空の場合は空 Vec を返す
/// （未 open ケースを成功扱い）。
///
/// # Errors
///
/// `tasks_cache` の `Mutex` が poison している場合に
/// `GetTasksError::StateLockPoisoned` を返す。
pub(crate) fn get_tasks_impl(state: &AppState) -> Result<Vec<Task>, GetTasksError> {
    let snapshot = state.tasks_snapshot()?;
    Ok(TaskIndex::from(snapshot).sorted_by_id())
}

#[cfg(test)]
#[path = "get_tests.rs"]
mod get_tests;
