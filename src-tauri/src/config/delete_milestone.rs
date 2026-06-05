//! `delete_milestone` Tauri command 本体。
//!
//! 指定 name のマイルストーンを `.spec-board/milestones.yml` から削除する書き込み専用
//! command。削除前に「そのマイルストーンを使っているタスク件数」を算出して payload で返す。
//! usageCount > 0 でも削除は実行し、タスク frontmatter（`task.milestone`）は一切変更しない
//! （非破壊）。
//!
//! 使用数は「削除前に何件で使われていたか」という操作結果のため、`snapshot_milestone_delete`
//! で milestones と tasks を整合した 1 回の観測から算出する。
//!
//! # ロック取得順序
//!
//! `project_path → milestones → tasks_cache`（preflight `check_milestones_lock` +
//! `check_tasks_cache_lock`、`snapshot_milestone_delete`、`replace_milestones_if_project_matches`）。
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
use crate::state::{AppState, AppStateError};
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
}

impl From<AppStateError> for DeleteMilestoneError {
    fn from(_: AppStateError) -> Self {
        DeleteMilestoneError::StateLockPoisoned
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
    state.check_milestones_lock()?;
    state.check_tasks_cache_lock()?;
    let ctx = state.snapshot_milestone_delete()?;
    let project_root = ctx
        .project_root
        .ok_or(DeleteMilestoneError::NoProjectOpen)?;
    let registry = ctx.milestones.ok_or(DeleteMilestoneError::NoProjectOpen)?;

    // 削除前の使用数（タスク単位・完全一致）。task 集約へ委譲する。
    let usage_count = TaskIndex::milestone_usage_counts(&ctx.tasks)
        .get(&args.name)
        .copied()
        .unwrap_or(0);

    let next = registry.plan_delete_milestone(&args.name)?;

    let store = milestone_registry_store(&project_root);
    store.save(&next)?;

    state.replace_milestones_if_project_matches(&project_root, next)?;
    Ok(DeleteMilestonePayload { usage_count })
}

#[cfg(test)]
#[path = "delete_milestone_tests.rs"]
mod delete_milestone_tests;
