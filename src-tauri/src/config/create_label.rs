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
//! `project_path → labels`（`snapshot_label_write` / `replace_labels_if_project_matches`）。
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
use crate::state::{AppState, AppStateError};

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
}

impl From<AppStateError> for CreateLabelError {
    fn from(_: AppStateError) -> Self {
        CreateLabelError::StateLockPoisoned
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
/// 2. snapshot: `snapshot_label_write` で `project_path` / `labels` を整合取得
/// 3. plan: `plan_create_label`（副作用ゼロ・updated 自動セット・validate 再利用）
/// 4. write: `store.save` で disk へ atomic 書き込み
/// 5. commit: `replace_labels_if_project_matches` で snapshot 時と同一プロジェクトのときのみ反映
///
/// disk write 失敗時は commit を呼ばないため in-memory は汚れない。
pub(crate) fn create_label_impl(
    state: &AppState,
    args: CreateLabelArgs,
    clock: &dyn Clock,
) -> Result<(), CreateLabelError> {
    state.check_labels_lock()?;
    let ctx = state.snapshot_label_write()?;
    let project_root = ctx.project_root.ok_or(CreateLabelError::NoProjectOpen)?;
    let registry = ctx.labels.ok_or(CreateLabelError::NoProjectOpen)?;

    let definition = LabelDefinition::from(args);
    let next = registry.plan_create_label(definition, clock)?;

    let store = label_registry_store(&project_root);
    store.save(&next)?;

    state.replace_labels_if_project_matches(&project_root, next)?;
    Ok(())
}

#[cfg(test)]
#[path = "create_label_tests.rs"]
mod create_label_tests;
