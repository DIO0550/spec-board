//! `update_milestone` Tauri command 本体。
//!
//! 既存マイルストーンの metadata（title / description / due / order / state）を更新する書き込み
//! 専用 command。`update_label` と同型の 4 段（preflight → snapshot → plan → disk write →
//! commit）で進める。`name` は同一性キーで **rename しない**。未指定フィールドはクリアする
//! （PUT セマンティクス）。`updated` はサーバが現在時刻で自動セットする。ドメイン不変条件と
//! 存在確認は aggregate [`MilestoneRegistry::plan_update_milestone`] に委譲する。
//!
//! # ロック取得順序
//!
//! `project_path → milestones`（`snapshot_milestone_write` /
//! `replace_milestones_if_project_matches`）。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`get_labels` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）

use std::sync::Arc;

use serde::Deserialize;
use tauri::State;
use thiserror::Error;

use crate::config::{
    milestone_registry_store, Clock, MilestoneRegistryStore, MilestoneState, SaveMilestonesError,
    SystemClock, UpdateMilestoneIntent, UpdateMilestonePlanError,
};
use crate::state::{AppState, AppStateError};

/// `update_milestone` コマンドの引数。FE は全フィールドを camelCase で送る（PUT）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMilestoneArgs {
    /// 更新対象マイルストーンの name（同一性キー・rename しない）。
    pub name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub due: Option<String>,
    pub order: Option<u32>,
    pub state: Option<String>,
}

impl From<UpdateMilestoneArgs> for UpdateMilestoneIntent {
    fn from(args: UpdateMilestoneArgs) -> Self {
        UpdateMilestoneIntent {
            name: args.name,
            // create と共通方針: 空文字は未指定（None）に倒す。
            title: args.title.filter(|s| !s.is_empty()),
            description: args.description.filter(|s| !s.is_empty()),
            due: args.due.filter(|s| !s.is_empty()),
            order: args.order,
            state: args
                .state
                .filter(|s| !s.is_empty())
                .map(MilestoneState::from_lenient),
        }
    }
}

/// `update_milestone` コマンドのエラー。
#[derive(Debug, Error)]
pub enum UpdateMilestoneError {
    /// プロジェクト未オープン（`project_path` / `milestones` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン plan エラー（空名 / 不在 / 不変条件違反）。
    #[error(transparent)]
    Plan(#[from] UpdateMilestonePlanError),
    /// milestones.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveMilestonesError),
}

impl From<AppStateError> for UpdateMilestoneError {
    fn from(_: AppStateError) -> Self {
        UpdateMilestoneError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`update_milestone_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn update_milestone(
    state: State<'_, Arc<AppState>>,
    args: UpdateMilestoneArgs,
) -> Result<(), String> {
    update_milestone_impl(state.inner(), args, &SystemClock).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。create と同型の 4 段 effect 層。
pub(crate) fn update_milestone_impl(
    state: &AppState,
    args: UpdateMilestoneArgs,
    clock: &dyn Clock,
) -> Result<(), UpdateMilestoneError> {
    state.check_milestones_lock()?;
    let ctx = state.snapshot_milestone_write()?;
    let project_root = ctx
        .project_root
        .ok_or(UpdateMilestoneError::NoProjectOpen)?;
    let registry = ctx.milestones.ok_or(UpdateMilestoneError::NoProjectOpen)?;

    let intent: UpdateMilestoneIntent = args.into();
    let next = registry.plan_update_milestone(intent, clock)?;

    let store = milestone_registry_store(&project_root);
    store.save(&next)?;

    state.replace_milestones_if_project_matches(&project_root, next)?;
    Ok(())
}

#[cfg(test)]
#[path = "update_milestone_tests.rs"]
mod update_milestone_tests;
