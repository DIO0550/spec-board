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
    milestone_registry_store, Clock, MilestoneDefinition, MilestoneRegistryStore, MilestoneState,
    MilestoneValidationError, SaveMilestonesError, SystemClock,
};
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::SessionIdentity;
use crate::state::{AppState, AppStateError, SessionWriteError};

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
    /// project session writer protocolの失敗。
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for CreateMilestoneError {
    fn from(_: AppStateError) -> Self {
        CreateMilestoneError::StateLockPoisoned
    }
}
impl From<SessionWriteError> for CreateMilestoneError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
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
    let target = state
        .active_session_identity()
        .map_err(SessionWriteError::from)?;
    let store = milestone_registry_store(target.project_root().as_path());
    create_milestone_impl_with_store(state, &target, &store, args, clock)
}

pub(crate) fn create_milestone_impl_with_store(
    state: &AppState,
    target: &SessionIdentity,
    store: &dyn MilestoneRegistryStore,
    args: CreateMilestoneArgs,
    clock: &dyn Clock,
) -> Result<(), CreateMilestoneError> {
    state.with_project_writer_lease_for(target, |snapshot| {
        let definition: MilestoneDefinition = args.into();
        let next = snapshot
            .milestones()
            .plan_create_milestone(definition, clock)?;
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
                    log::warn!("create_milestone conflict recovery failed: {recovery}");
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => Err(error.into()),
        }
    })
}

#[cfg(test)]
#[path = "create_milestone_tests.rs"]
mod create_milestone_tests;
