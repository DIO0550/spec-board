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

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use super::projection::TaskProjectionMap;
use super::task_index::{Task, TaskIndex};
use crate::state::{AppState, AppStateError};

/// `get_tasks` コマンドが FE へ返す payload。
///
/// `tasks` は `id` 昇順。`projections` は `tasks` と同じ集合を対象に
/// `TaskIndex::project_all` が作った filePath キーの map。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTasksPayload {
    pub tasks: Vec<Task>,
    pub projections: TaskProjectionMap,
}

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
pub fn get_tasks(state: State<'_, Arc<AppState>>) -> Result<GetTasksPayload, String> {
    get_tasks_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// `config` と `tasks_cache` を整合 snapshot し、done column を解決したうえで
/// `TaskIndex` aggregate に並び順と projection の生成を委譲する。未 open
/// （`config` が `None` かつ cache が空）の場合は tasks / projections ともに空の
/// payload を成功で返す。
///
/// `sorted_by_id` は `self` を消費するため、`&self` query である `project_all` を
/// 先に呼ぶ順序に依存する。`done_column` は `config` の borrow を跨がないよう
/// `cloned()` で所有権を取る。
///
/// # Errors
///
/// `config` / `tasks_cache` いずれかの `Mutex` が poison している場合に
/// `GetTasksError::StateLockPoisoned` を返す。
pub(crate) fn get_tasks_impl(state: &AppState) -> Result<GetTasksPayload, GetTasksError> {
    let context = state.snapshot_config_and_tasks()?;
    let done_column = context
        .config
        .as_ref()
        .and_then(|config| config.resolved_done_column())
        .cloned();
    let index = TaskIndex::new(context.tasks);
    let projections = index.project_all(done_column.as_ref());
    Ok(GetTasksPayload {
        tasks: index.sorted_by_id(),
        projections,
    })
}

#[cfg(test)]
#[path = "get_tests.rs"]
mod get_tests;
