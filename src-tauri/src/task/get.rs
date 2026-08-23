//! `get_tasks` Tauri command 本体。
//!
//! 現在の project session snapshot に格納済みの `Task` 一覧を取得し、`TaskIndex` aggregate
//! に並び順の決定を委譲して返す純粋な読み取り専用 command。`open_project` で
//! commit された state を消費する後続 API としての位置付け。
//!
//! 並び順の契約は `open_project` と同一（カラム表示順 → カラム内 `cardOrder` →
//! canonical `filePath`（wire `id`）昇順）で、`TaskIndex::sorted_by_board_order` に集約する。FE は watcher の
//! full rescan / gap 復旧でこの応答を board へ反映するため、`open_project` と
//! 並びが食い違うと復旧のたびに DnD で決めた順序が壊れる。
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

use super::payload::TaskPayload;
use super::projection::{MilestoneProjectionMap, TaskForest, TaskProjectionMap};
use super::task_index::TaskIndex;
use crate::config::column_name::ColumnName;
use crate::config::Column;
use crate::project::load_warning::ProjectLoadWarning;
use crate::state::watcher_session::WatcherSession;
use crate::state::{AppState, AppStateError};

/// `get_tasks` コマンドが FE へ返す payload。
///
/// `tasks` は `open_project` と同じ board 表示順（カラム表示順 → カラム内
/// `cardOrder` → `id` 昇順）。`projections` は `tasks` と同じ集合を対象に
/// `TaskIndex::project_all` が作った filePath キーの map。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTasksPayload {
    pub tasks: Vec<TaskPayload>,
    /// board 表示順のカラム定義。`get_columns` と同じ導出規則。
    ///
    /// `tasks` と**同一 snapshot の `Config`** から導出することが必須。別 IPC で
    /// 取り直すと、間に走った commit をまたいで「tasks は旧 revision・columns は
    /// 新 revision」が混在しうる（FE の read barrier は BE 側 commit を捉えない）。
    pub columns: Vec<Column>,
    /// 解決済みの完了カラム。project 未 open では `None`。
    pub done_column: Option<ColumnName>,
    pub projections: TaskProjectionMap,
    /// milestone 名ごとの進捗と、`tasks` と同じ順序の所属 task path。
    pub milestone_projections: MilestoneProjectionMap,
    /// 親子階層のネストツリー。root 列・兄弟列とも `tasks` と同じ board 表示順で、
    /// ノード集合は `tasks` と過不足なく一致する（`open_project` と同形）。
    pub task_tree: TaskForest,
    pub load_warnings: Vec<ProjectLoadWarning>,
    /// この snapshot の watcher session（`open_project` 応答と同じ形）。
    ///
    /// FE は resync 完了時にこの値で envelope 検証の baseline を丸ごと取り直す。
    /// revision だけでは `lastEventSeq` を更新できず、gap 検知が「破棄した番号が
    /// 欠番のまま残る → 次の event で必ず gap」という自走ループになる。
    pub session: WatcherSession,
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
/// `config` と `tasks_cache` を整合 snapshot し、並び順と projection 群の導出は
/// `TaskIndex::project_board_view` へ委譲する。`open_project` も同じ関数を通すため、
/// 両応答の tasks / projections / milestoneProjections / taskTree は同一の集合・順序に
/// なる。ここに手順をコピーしないこと。
///
/// 未 open（`config` が `None` かつ cache が空）の場合は tasks / 両 projection /
/// taskTree ともに空の payload を成功で返す。
///
/// # Errors
///
/// `config` / `tasks_cache` いずれかの `Mutex` が poison している場合に
/// `GetTasksError::StateLockPoisoned` を返す。
pub(crate) fn get_tasks_impl(state: &AppState) -> Result<GetTasksPayload, GetTasksError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Ok(GetTasksPayload {
            tasks: Vec::new(),
            columns: Vec::new(),
            done_column: None,
            projections: TaskProjectionMap::new(),
            milestone_projections: MilestoneProjectionMap::new(),
            task_tree: TaskForest::new(),
            load_warnings: Vec::new(),
            session: WatcherSession::idle(),
        });
    };
    let tasks = snapshot.tasks().values().cloned().collect();
    let config = snapshot.config();
    let view = TaskIndex::project_board_view(tasks, config);
    Ok(GetTasksPayload {
        tasks: view.tasks.into_iter().map(TaskPayload::from).collect(),
        columns: config.columns_in_display_order(),
        done_column: config.resolved_done_column().cloned(),
        projections: view.projections,
        milestone_projections: view.milestone_projections,
        task_tree: view.task_tree,
        load_warnings: snapshot.load_warnings().to_vec(),
        session: state.watcher_session_for_snapshot(&snapshot),
    })
}

#[cfg(test)]
#[path = "get_tests.rs"]
mod get_tests;
