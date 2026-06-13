//! `get_milestones` Tauri command 本体。
//!
//! `AppState.milestones` に commit 済みの `MilestoneRegistry` からマイルストーン定義一覧を
//! 取得し、各マイルストーンの使用数（`tasks_cache` から算出）と合わせて FE の表示用 payload
//! として返す読み取り専用 command。`get_labels` と同型の 3 段構成（payload 型 +
//! `#[tauri::command]` 薄層 + `_impl`）を採用する。
//!
//! payload は milestones.yml の定義順をそのまま保持する（並べ替えない）。milestones.yml
//! 不在（= 空レジストリ）でも `Ok(空配列)` を返す。プロジェクト未オープン（`milestones` が
//! `None`）のときのみ `NoProjectOpen`。
//!
//! 使用数集計は task 集約 [`TaskIndex::milestone_usage_counts`] に委譲し、依存方向を
//! milestone/config → task の一方向に保つ。`snapshot_milestone_delete` で milestones と tasks を
//! 整合した 1 回の観測から算出する。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`get_labels` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::config::MilestoneDefinition;
use crate::state::{AppState, AppStateError};
use crate::task::task_index::TaskIndex;

/// `get_milestones` コマンドが FE へ返す payload。
///
/// `milestones` は milestones.yml 由来のドメイン定義を定義順で保持する。`usage_counts` は
/// マイルストーン名 → 使用タスク件数のマップで、task 集約由来のため registry 未定義の暗黙
/// マイルストーンのキーも含み得る（FE は `milestones[].name` で引くため余分なキーは無害）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetMilestonesPayload {
    pub milestones: Vec<MilestoneDefinition>,
    pub usage_counts: HashMap<String, usize>,
}

/// `get_milestones` コマンドのエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetMilestonesError {
    /// `AppState.milestones` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex (`milestones` / `tasks_cache`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetMilestonesError {
    fn from(_: AppStateError) -> Self {
        GetMilestonesError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`get_milestones_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn get_milestones(state: State<'_, Arc<AppState>>) -> Result<GetMilestonesPayload, String> {
    get_milestones_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。`AppState.milestones` と `tasks_cache` から payload を組む。
///
/// milestones.yml 不在 = 空レジストリでも `Ok(空配列)`。プロジェクト未オープン
/// （milestones が `None`）のみ `NoProjectOpen`。
pub(crate) fn get_milestones_impl(
    state: &AppState,
) -> Result<GetMilestonesPayload, GetMilestonesError> {
    // milestones と tasks を整合 snapshot で取得（usage 算出のため）。
    let ctx = state.snapshot_milestone_delete()?;
    let registry = ctx.milestones.ok_or(GetMilestonesError::NoProjectOpen)?;
    // 集計は task 集約 TaskIndex のメソッドへ委譲（free function を config 側に作らない）。
    let usage_counts = TaskIndex::new(ctx.tasks).milestone_usage_counts();
    Ok(GetMilestonesPayload {
        milestones: registry.milestones,
        usage_counts,
    })
}

#[cfg(test)]
#[path = "get_milestones_tests.rs"]
mod get_milestones_tests;
