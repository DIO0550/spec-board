//! `get_tasks` Tauri command 本体。
//!
//! 現在の project session snapshot に格納済みの `Task` 一覧を取得し、`TaskIndex` aggregate
//! に並び順の決定を委譲して返す純粋な読み取り専用 command。`open_project` で
//! commit された state を消費する後続 API としての位置付け。
//!
//! 並び順の契約は `open_project` と同一（カラム表示順 → カラム内 `cardOrder` →
//! `id` 昇順）で、`TaskIndex::sorted_by_board_order` に集約する。FE は watcher の
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

use super::projection::{MilestoneProjectionMap, TaskProjectionMap};
use super::task_index::{Task, TaskIndex};
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
    pub tasks: Vec<Task>,
    pub projections: TaskProjectionMap,
    /// milestone 名ごとの進捗と、`tasks` と同じ順序の所属 task path。
    pub milestone_projections: MilestoneProjectionMap,
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
/// `config` と `tasks_cache` を整合 snapshot し、done column を解決したうえで
/// `TaskIndex` aggregate に並び順と projection の生成を委譲する。未 open
/// （`config` が `None` かつ cache が空）の場合は tasks / 両 projection ともに空の
/// payload を成功で返す。task を payload 順へ並べてから `TaskIndex` を再構築し、
/// tasks と両 projection が同じ順序の集合から作られることを保証する。
///
/// # Errors
///
/// `config` / `tasks_cache` いずれかの `Mutex` が poison している場合に
/// `GetTasksError::StateLockPoisoned` を返す。
pub(crate) fn get_tasks_impl(state: &AppState) -> Result<GetTasksPayload, GetTasksError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Ok(GetTasksPayload {
            tasks: Vec::new(),
            projections: TaskProjectionMap::new(),
            milestone_projections: MilestoneProjectionMap::new(),
            load_warnings: Vec::new(),
            session: WatcherSession::idle(),
        });
    };
    let done_column = snapshot.config().resolved_done_column().cloned();
    // 並び順は `open_project` と同じ board 表示順に揃える。FE は配列順をそのまま
    // 表示順に使うため、ここが id 順だと full rescan / gap 復旧のたびに DnD で
    // 決めた並びが崩れる。未 open（config なし）のときだけ id 昇順にフォールバックする。
    let tasks = snapshot.tasks().values().cloned().collect();
    let ordered_tasks = TaskIndex::new(tasks).sorted_by_board_order(snapshot.config());
    let index = TaskIndex::new(ordered_tasks);
    let projections = index.project_all(done_column.as_ref());
    let milestone_projections = index.project_milestones(done_column.as_ref());
    let tasks = index.into_tasks();
    Ok(GetTasksPayload {
        tasks,
        projections,
        milestone_projections,
        load_warnings: snapshot.load_warnings().to_vec(),
        session: state.watcher_session_for_snapshot(&snapshot),
    })
}

#[cfg(test)]
#[path = "get_tests.rs"]
mod get_tests;
