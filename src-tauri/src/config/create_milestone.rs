//! `create_milestone` Tauri command 本体。
//!
//! 新しいマイルストーンを `.spec-board/milestones.yml` に追記する書き込み専用 command。
//! `create_label` と同型の 4 段（preflight lock → snapshot → plan（副作用ゼロ）→ disk write →
//! project 一致時のみ in-memory commit）で進める。ドメイン不変条件（空名拒否・完全一致重複
//! 拒否）の検証と `updated` 自動セットは aggregate [`MilestoneRegistry::plan_create_milestone`]
//! に委譲する。
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
    milestone_registry_store, Clock, MilestoneDefinition, MilestoneRegistryStore, MilestoneState,
    MilestoneValidationError, SaveMilestonesError, SystemClock,
};
use crate::state::{AppState, AppStateError};

/// `create_milestone` コマンドの引数。FE は camelCase で送る。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMilestoneArgs {
    pub name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub due: Option<String>,
    pub order: Option<u32>,
    /// FE は文字列で送り、`MilestoneState::from_lenient` で正規化する（未知値も保持）。
    pub state: Option<String>,
}

impl From<CreateMilestoneArgs> for MilestoneDefinition {
    fn from(args: CreateMilestoneArgs) -> Self {
        MilestoneDefinition {
            name: args.name,
            // 任意文字列フィールドは空文字を未指定（None）へ正規化する（YAML load 経路と対称）。
            title: args.title.filter(|s| !s.is_empty()),
            description: args.description.filter(|s| !s.is_empty()),
            due: args.due.filter(|s| !s.is_empty()),
            order: args.order,
            // 空文字は None（未指定）に倒してから from_lenient（空文字を Other("") にしない）。
            state: args
                .state
                .filter(|s| !s.is_empty())
                .map(MilestoneState::from_lenient),
            // updated は plan_create_milestone が clock でセットする。
            updated: None,
        }
    }
}

/// `create_milestone` コマンドのエラー。
#[derive(Debug, Error)]
pub enum CreateMilestoneError {
    /// プロジェクト未オープン（`project_path` / `milestones` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン不変条件違反（空名 / 完全一致重複）。
    #[error(transparent)]
    Validation(#[from] MilestoneValidationError),
    /// milestones.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveMilestonesError),
}

impl From<AppStateError> for CreateMilestoneError {
    fn from(_: AppStateError) -> Self {
        CreateMilestoneError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`create_milestone_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn create_milestone(
    state: State<'_, Arc<AppState>>,
    args: CreateMilestoneArgs,
) -> Result<(), String> {
    create_milestone_impl(state.inner(), args, &SystemClock).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。create_label と同型の 4 段 effect 層。
///
/// disk write 失敗時は commit を呼ばないため in-memory は汚れない。
pub(crate) fn create_milestone_impl(
    state: &AppState,
    args: CreateMilestoneArgs,
    clock: &dyn Clock,
) -> Result<(), CreateMilestoneError> {
    state.check_milestones_lock()?;
    let ctx = state.snapshot_milestone_write()?;
    let project_root = ctx
        .project_root
        .ok_or(CreateMilestoneError::NoProjectOpen)?;
    let registry = ctx.milestones.ok_or(CreateMilestoneError::NoProjectOpen)?;

    let definition: MilestoneDefinition = args.into();
    let next = registry.plan_create_milestone(definition, clock)?;

    let store = milestone_registry_store(&project_root);
    store.save(&next)?;

    state.replace_milestones_if_project_matches(&project_root, next)?;
    Ok(())
}

#[cfg(test)]
#[path = "create_milestone_tests.rs"]
mod create_milestone_tests;
