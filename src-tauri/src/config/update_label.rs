//! `update_label` Tauri command 本体。
//!
//! 既存ラベルの metadata（description / group / color）を更新する書き込み専用 command。
//! `create_label` と同型の 4 段（preflight → snapshot → plan → disk write → commit）で進める。
//! `name` は同一性キーで **rename しない**。未指定フィールドはクリアする（PUT セマンティクス）。
//! `updated` はサーバが現在時刻で自動セットする。ドメイン不変条件と存在確認は aggregate
//! [`LabelRegistry::plan_update_label`] に委譲する。
//!
//! # ロック取得順序
//!
//! `writer gate → session snapshot`（`coherent session snapshot` / `expected SessionId + revision CAS commit`）。
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
    label_registry_store, Clock, LabelColor, LabelGroup, LabelRegistryStore, SaveLabelsError,
    SystemClock, UpdateLabelIntent, UpdateLabelPlanError,
};
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::SessionIdentity;
use crate::state::{AppState, AppStateError, SessionWriteError};

/// `update_label` コマンドの引数。FE は全フィールドを camelCase で送る（PUT）。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLabelArgs {
    /// 更新対象ラベルの name（同一性キー・rename しない）。
    pub name: String,
    pub description: Option<String>,
    pub group: Option<String>,
    pub color: Option<String>,
}

impl From<UpdateLabelArgs> for UpdateLabelIntent {
    fn from(args: UpdateLabelArgs) -> Self {
        UpdateLabelIntent {
            name: args.name,
            description: args.description,
            // group / color の lenient 変換（空 group は None・不正 hex は None）。create と共通方針。
            group: args.group.and_then(LabelGroup::from_lenient),
            color: args.color.as_deref().and_then(LabelColor::from_hex),
        }
    }
}

/// `update_label` コマンドのエラー。
#[derive(Debug, Error)]
pub enum UpdateLabelError {
    /// プロジェクト未オープン（`project_path` / `labels` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン plan エラー（空名 / 不在 / 不変条件違反）。
    #[error(transparent)]
    Plan(#[from] UpdateLabelPlanError),
    /// labels.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveLabelsError),
    /// project session writer protocolの失敗。
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for UpdateLabelError {
    fn from(_: AppStateError) -> Self {
        UpdateLabelError::StateLockPoisoned
    }
}

impl From<SessionWriteError> for UpdateLabelError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
    }
}

/// Tauri command 薄層。`update_label_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn update_label(state: State<'_, Arc<AppState>>, args: UpdateLabelArgs) -> Result<(), String> {
    update_label_impl(state.inner(), args, &SystemClock).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。create と同型の 4 段 effect 層。
pub(crate) fn update_label_impl(
    state: &AppState,
    args: UpdateLabelArgs,
    clock: &dyn Clock,
) -> Result<(), UpdateLabelError> {
    let target = state
        .active_session_identity()
        .map_err(SessionWriteError::from)?;
    let store = label_registry_store(target.project_root().as_path());
    update_label_impl_with_store(state, &target, &store, args, clock)
}

pub(crate) fn update_label_impl_with_store(
    state: &AppState,
    target: &SessionIdentity,
    store: &dyn LabelRegistryStore,
    args: UpdateLabelArgs,
    clock: &dyn Clock,
) -> Result<(), UpdateLabelError> {
    state.with_project_writer_lease_for(target, |snapshot| {
        let intent: UpdateLabelIntent = args.into();
        let next = snapshot.labels().plan_update_label(intent, clock)?;
        let _resources = state.preflight_session_write(snapshot)?;
        store.save(&next)?;

        let commit = state.commit_session_write(&snapshot.identity(), move |session| {
            session.replace_labels(next);
        });
        match commit {
            Ok(_) => Ok(()),
            Err(SessionWriteError::Conflict(conflict)) => {
                if let Err(recovery) = resync_if_same_project_under_lease(
                    state,
                    target.project_root(),
                    &conflict,
                    ResyncSource::Labels { store },
                ) {
                    log::warn!("update_label conflict recovery failed: {recovery}");
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => Err(error.into()),
        }
    })
}

#[cfg(test)]
#[path = "update_label_tests.rs"]
mod update_label_tests;
