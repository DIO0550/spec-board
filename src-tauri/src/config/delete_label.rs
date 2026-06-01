//! `delete_label` Tauri command 本体。
//!
//! 指定 name のラベルを `.spec-board/labels.yml` から削除する書き込み専用 command。
//! 削除前に「そのラベルを使っているタスク件数」を算出して payload で返す。usageCount > 0
//! でも削除は実行し、タスク frontmatter（`task.labels`）は一切変更しない。
//!
//! 使用数は「削除前に何件で使われていたか」という操作結果のため、`snapshot_label_delete`
//! で labels と tasks を整合した 1 回の観測から算出する（`get_labels` の eventual-consistent な
//! 集計とは異なる）。
//!
//! # ロック取得順序
//!
//! `project_path → labels → tasks_cache`（preflight `check_labels_lock` + `check_tasks_cache_lock`、
//! `snapshot_label_delete`、`replace_labels_if_project_matches`）。
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
    label_registry_store, DeleteLabelPlanError, LabelRegistryStore, SaveLabelsError,
};
use crate::state::{AppState, AppStateError};
use crate::task::task_index::TaskIndex;

/// `delete_label` コマンドの引数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLabelArgs {
    pub name: String,
}

/// `delete_label` の payload。削除前に算出した使用数（使用タスク件数）を返す。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLabelPayload {
    pub usage_count: usize,
}

/// `delete_label` コマンドのエラー。
#[derive(Debug, Error)]
pub enum DeleteLabelError {
    /// プロジェクト未オープン（`project_path` / `labels` が `None`）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// ドメイン plan エラー（不在）。
    #[error(transparent)]
    Plan(#[from] DeleteLabelPlanError),
    /// labels.yml への保存失敗。
    #[error(transparent)]
    Save(#[from] SaveLabelsError),
}

impl From<AppStateError> for DeleteLabelError {
    fn from(_: AppStateError) -> Self {
        DeleteLabelError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`delete_label_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn delete_label(
    state: State<'_, Arc<AppState>>,
    args: DeleteLabelArgs,
) -> Result<DeleteLabelPayload, String> {
    delete_label_impl(state.inner(), args).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// 1. preflight: `check_labels_lock` + `check_tasks_cache_lock`（副作用前の lock 健全性確認）
/// 2. snapshot: `snapshot_label_delete` で `project_path` / `labels` / `tasks` を整合取得
/// 3. 削除前 usageCount を `TaskIndex::label_usage_counts` から算出（frontmatter 不変のため
///    削除後も同値）
/// 4. plan: `plan_delete_label`（不在なら `NotFound`）
/// 5. write: `store.save`
/// 6. commit: `replace_labels_if_project_matches`
pub(crate) fn delete_label_impl(
    state: &AppState,
    args: DeleteLabelArgs,
) -> Result<DeleteLabelPayload, DeleteLabelError> {
    state.check_labels_lock()?;
    state.check_tasks_cache_lock()?;
    let ctx = state.snapshot_label_delete()?;
    let project_root = ctx.project_root.ok_or(DeleteLabelError::NoProjectOpen)?;
    let registry = ctx.labels.ok_or(DeleteLabelError::NoProjectOpen)?;

    // 削除前の使用数（タスク単位・完全一致）。task 集約へ委譲する。
    let usage_count = TaskIndex::label_usage_counts(&ctx.tasks)
        .get(&args.name)
        .copied()
        .unwrap_or(0);

    let next = registry.plan_delete_label(&args.name)?;

    let store = label_registry_store(&project_root);
    store.save(&next)?;

    state.replace_labels_if_project_matches(&project_root, next)?;
    Ok(DeleteLabelPayload { usage_count })
}

#[cfg(test)]
#[path = "delete_label_tests.rs"]
mod delete_label_tests;
