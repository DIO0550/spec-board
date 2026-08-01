//! `create_label` Tauri command 本体。
//!
//! 新しいラベルを `.spec-board/labels.yml` に追記する書き込み専用 command。
//! `update_card_order` と同じ「preflight lock → snapshot → plan（副作用ゼロ）→ disk write →
//! project 一致時のみ in-memory commit」の 4 段で進める。ドメイン不変条件（空名拒否・
//! 完全一致重複拒否）の検証と `updated` 自動セットは aggregate [`LabelRegistry::plan_create_label`]
//! に委譲する。
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
    label_registry_store, Clock, LabelColor, LabelDefinition, LabelGroup, LabelRegistryStore,
    LabelValidationError, SaveLabelsError, SystemClock,
};
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::SessionIdentity;
use crate::state::{AppState, AppStateError, SessionWriteError};

/// `create_label` コマンドの引数。FE は camelCase で送る。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLabelArgs {
    pub name: String,
    pub description: Option<String>,
    pub group: Option<String>,
    pub color: Option<String>,
}

impl From<CreateLabelArgs> for LabelDefinition {
    fn from(args: CreateLabelArgs) -> Self {
        LabelDefinition {
            name: args.name,
            description: args.description,
            // group / color はドメイン VO へ lenient 変換（空 group は None・不正 hex は None）。
            group: args.group.and_then(LabelGroup::from_lenient),
            color: args.color.as_deref().and_then(LabelColor::from_hex),
            // updated は plan_create_label が clock でセットする。
            updated: None,
        }
    }
}

/// `create_label` コマンドのエラー。
#[derive(Debug, Error)]
pub enum CreateLabelError {
    /// プロジェクト未オープン（`project_path` / `labels` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン不変条件違反（空名 / 完全一致重複）。
    #[error(transparent)]
    Validation(#[from] LabelValidationError),
    /// labels.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveLabelsError),
    /// project session writer protocolの失敗。
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for CreateLabelError {
    fn from(_: AppStateError) -> Self {
        CreateLabelError::StateLockPoisoned
    }
}
impl From<SessionWriteError> for CreateLabelError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
    }
}

/// Tauri command 薄層。`create_label_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn create_label(state: State<'_, Arc<AppState>>, args: CreateLabelArgs) -> Result<(), String> {
    create_label_impl(state.inner(), args, &SystemClock).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// 1. preflight: `check_labels_lock` で副作用前に lock 健全性を確認
/// 2. snapshot: `coherent session snapshot` で `project_path` / `labels` を整合取得
/// 3. plan: `plan_create_label`（副作用ゼロ・updated 自動セット・validate 再利用）
/// 4. write: `store.save` で disk へ atomic 書き込み
/// 5. commit: `expected SessionId + revision CAS commit` で snapshot 時と同一プロジェクトのときのみ反映
///
/// disk write 失敗時は commit を呼ばないため in-memory は汚れない。
pub(crate) fn create_label_impl(
    state: &AppState,
    args: CreateLabelArgs,
    clock: &dyn Clock,
) -> Result<(), CreateLabelError> {
    let target = state
        .active_session_identity()
        .map_err(SessionWriteError::from)?;
    let store = label_registry_store(target.project_root().as_path());
    create_label_impl_with_store(state, &target, &store, args, clock)
}

pub(crate) fn create_label_impl_with_store(
    state: &AppState,
    target: &SessionIdentity,
    store: &dyn LabelRegistryStore,
    args: CreateLabelArgs,
    clock: &dyn Clock,
) -> Result<(), CreateLabelError> {
    state.with_project_writer_lease_for(target, |snapshot| {
        let definition: LabelDefinition = args.into();
        let next = snapshot.labels().plan_create_label(definition, clock)?;
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
                    log::warn!("create_label conflict recovery failed: {recovery}");
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => Err(error.into()),
        }
    })
}

#[cfg(test)]
#[path = "create_label_tests.rs"]
mod create_label_tests;
