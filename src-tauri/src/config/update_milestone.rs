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
//! `writer gate → session snapshot`（`coherent session snapshot` /
//! `expected SessionId + revision CAS commit`）。
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
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::SessionIdentity;
use crate::state::{AppState, AppStateError, SessionWriteError};

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
    /// project session writer protocolの失敗。
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for UpdateMilestoneError {
    fn from(_: AppStateError) -> Self {
        UpdateMilestoneError::StateLockPoisoned
    }
}
impl From<SessionWriteError> for UpdateMilestoneError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
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
    let target = state
        .active_session_identity()
        .map_err(SessionWriteError::from)?;
    let store = milestone_registry_store(target.project_root().as_path());
    update_milestone_impl_with_store(state, &target, &store, args, clock)
}

pub(crate) fn update_milestone_impl_with_store(
    state: &AppState,
    target: &SessionIdentity,
    store: &dyn MilestoneRegistryStore,
    args: UpdateMilestoneArgs,
    clock: &dyn Clock,
) -> Result<(), UpdateMilestoneError> {
    state.with_project_writer_lease_for(target, |snapshot| {
        let intent: UpdateMilestoneIntent = args.into();
        let next = snapshot.milestones().plan_update_milestone(intent, clock)?;
        let _resources = state.preflight_session_write(snapshot)?;
        store.save(&next)?;

        let commit = state.commit_session_write(&snapshot.identity(), move |session| {
            session.replace_milestones(next);
        });
        match commit {
            Ok(_) => Ok(()),
            Err(SessionWriteError::Conflict(conflict)) => {
                if let Err(recovery) = resync_if_same_project_under_lease(
                    state,
                    target.project_root(),
                    &conflict,
                    ResyncSource::Milestones { store },
                ) {
                    log::warn!("update_milestone conflict recovery failed: {recovery}");
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => Err(error.into()),
        }
    })
}

#[cfg(test)]
#[path = "update_milestone_tests.rs"]
mod update_milestone_tests;
