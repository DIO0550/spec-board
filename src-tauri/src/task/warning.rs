//! Task パース時の警告ドメイン。
//!
//! `TaskWarningCode` / `TaskWarning` は FE 側 enum と camelCase で対応するため、
//! variant 名と `#[serde(rename_all = "camelCase")]` を保持する。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskWarningCode {
    MissingTitleUsedFileName,
    InvalidTitleUsedFileName,
    MissingStatusUsedDefault,
    InvalidStatusUsedDefault,
    InvalidParentIgnored,
    ParentNotFound,
    NonStringExtraKeyIgnored,
    ExtraValueNotJsonCompatible,
    ParentCycle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWarning {
    pub code: TaskWarningCode,
    pub field: Option<String>,
    pub message: String,
}

/// `warnings` 配列に `ParentCycle` (field=`parent`) が既存なら何もせず、
/// 無ければ追加する共通 helper。message / field の文言を 1 箇所に集約することで
/// scan 経路 (`task_index::mark_cycle_members`) と update 経路
/// (`task::update::command::commit_cache`) の間で表記揺れが起きないようにする。
pub fn ensure_parent_cycle_warning(warnings: &mut Vec<TaskWarning>) {
    let already_exists = warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentCycle && warning.field.as_deref() == Some("parent")
    });
    if already_exists {
        return;
    }

    warnings.push(TaskWarning {
        code: TaskWarningCode::ParentCycle,
        field: Some("parent".to_string()),
        message: "parent chain forms a cycle".to_string(),
    });
}

#[cfg(test)]
#[path = "warning_tests.rs"]
mod warning_tests;
