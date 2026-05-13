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
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWarning {
    pub code: TaskWarningCode,
    pub field: Option<String>,
    pub message: String,
}
