//! `delete_milestone` Tauri command 本体。
//!
//! 指定 name のマイルストーンを `.spec-board/milestones.yml` から削除する書き込み専用
//! command。削除前に「そのマイルストーンを使っているタスク件数」を算出して payload で返す。
//! usageCount > 0 でも削除は実行し、タスク frontmatter（`task.milestone`）は一切変更しない
//! （非破壊）。
//!
//! 使用数は「削除前に何件で使われていたか」という操作結果のため、`coherent session snapshot`
//! で milestones と tasks を整合した 1 回の観測から算出する。
//!
//! # ロック取得順序
//!
//! `writer gate → session snapshot → tasks_cache`（preflight `check_milestones_lock` +
//! `check_tasks_cache_lock`、`coherent session snapshot`、`expected SessionId + revision CAS commit`）。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`get_labels` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use crate::config::{
    milestone_registry_store, DeleteMilestonePlanError, MilestoneRegistryStore, SaveMilestonesError,
};
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::SessionIdentity;
use crate::state::{AppState, AppStateError, SessionWriteError};
use crate::task::task_index::TaskIndex;

/// `delete_milestone` コマンドの引数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMilestoneArgs {
    pub name: String,
}

/// `delete_milestone` の payload。削除前に算出した使用数（使用タスク件数）を返す。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMilestonePayload {
    pub usage_count: usize,
}

/// `delete_milestone` コマンドのエラー。
#[derive(Debug, Error)]
pub enum DeleteMilestoneError {
    /// プロジェクト未オープン（`project_path` / `milestones` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン plan エラー（不在）。
    #[error(transparent)]
    Plan(#[from] DeleteMilestonePlanError),
    /// milestones.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveMilestonesError),
    /// project session writer protocolの失敗。
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for DeleteMilestoneError {
    fn from(_: AppStateError) -> Self {
        DeleteMilestoneError::StateLockPoisoned
    }
}
impl From<SessionWriteError> for DeleteMilestoneError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
    }
}

/// Tauri command 薄層。`delete_milestone_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn delete_milestone(
    state: State<'_, Arc<AppState>>,
    args: DeleteMilestoneArgs,
) -> Result<DeleteMilestonePayload, String> {
    delete_milestone_impl(state.inner(), args).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。delete_label と同型の effect 層。
///
/// 削除前 usageCount を `TaskIndex::milestone_usage_counts` から算出する（frontmatter 不変の
/// ため削除後も同値）。`plan_delete_milestone` は frontmatter に干渉しない（非破壊）。
pub(crate) fn delete_milestone_impl(
    state: &AppState,
    args: DeleteMilestoneArgs,
) -> Result<DeleteMilestonePayload, DeleteMilestoneError> {
    let target = state
        .active_session_identity()
        .map_err(SessionWriteError::from)?;
    let store = milestone_registry_store(target.project_root().as_path());
    delete_milestone_impl_with_store(state, &target, &store, args)
}

pub(crate) fn delete_milestone_impl_with_store(
    state: &AppState,
    target: &SessionIdentity,
    store: &dyn MilestoneRegistryStore,
    args: DeleteMilestoneArgs,
) -> Result<DeleteMilestonePayload, DeleteMilestoneError> {
    state.with_project_writer_lease_for(target, |snapshot| {
        let usage_count = TaskIndex::new(snapshot.tasks().values().cloned().collect())
            .milestone_usage_counts()
            .get(&args.name)
            .copied()
            .unwrap_or(0);
        let next = snapshot.milestones().plan_delete_milestone(&args.name)?;
        let _resources = state.preflight_session_write(snapshot)?;
        store.save(&next)?;

        let commit = state.commit_session_write(&snapshot.identity(), move |session| {
            session.replace_milestones(next);
        });
        match commit {
            Ok(_) => Ok(DeleteMilestonePayload { usage_count }),
            Err(SessionWriteError::Conflict(conflict)) => {
                if let Err(recovery) = resync_if_same_project_under_lease(
                    state,
                    target.project_root(),
                    &conflict,
                    ResyncSource::Milestones { store },
                ) {
                    log::warn!("delete_milestone conflict recovery failed: {recovery}");
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => Err(error.into()),
        }
    })
}

#[cfg(test)]
#[path = "delete_milestone_tests.rs"]
mod delete_milestone_tests;
