//! `update_task` のエラー型。
//!
//! FE 側 `TauriError.PATTERNS` で文字列マッチされるため、Display 文字列は
//! create_task と同じ自然文パターン (`"file not found: ..."` 等) を採用する。

use std::path::PathBuf;

use thiserror::Error;

use crate::state::AppStateError;
use crate::task::create::error::ContentRejectReason;
use crate::task::frontmatter::FrontmatterError;
use crate::task::io::TaskIoError;
use crate::task::parse::TaskParseError;
use crate::task::task_content::TaskContentError;
use crate::task::task_index::{ParentHierarchyErrorReason, ParentValidationFailure};
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

#[derive(Debug, Error)]
pub enum UpdateTaskError {
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("file not found: {}", .0.display())]
    FileNotFound(PathBuf),
    /// 既存ファイル parse 失敗（frontmatter 不在 / 構文エラー）。
    /// `frontmatter::parse_bytes` が `Ok(None)` を返した場合もこれにマップする。
    #[error("parse failed: {0}")]
    ParseFailed(String),
    /// 指定された parent が cache に見つからない。
    /// validate_parent_hierarchy は不在を warning にするだけのため、
    /// plan_update 内で明示的に検出してこの variant を返す。
    #[error("parent not found: {path}")]
    ParentNotFound { path: String },
    /// parent チェーンが循環している、あるいは深さ上限を超えている。
    #[error("parent validation: {file_path} ({reason})")]
    ParentCycleOrTooDeep {
        file_path: String,
        reason: ParentHierarchyErrorReason,
    },
    #[error("content not scanner eligible: {reason}")]
    ContentNotScannerEligible { reason: ContentRejectReason },
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

#[derive(Debug, Error)]
pub enum UpdateTaskCommandError {
    #[error(transparent)]
    Validation(#[from] UpdateTaskError),
    #[error("project is not opened")]
    NoProjectOpen,
    #[error("internal state lock poisoned")]
    AppState(#[from] AppStateError),
    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

impl From<ParentValidationFailure> for UpdateTaskError {
    fn from(f: ParentValidationFailure) -> Self {
        match f {
            ParentValidationFailure::NotFound { parent } => Self::ParentNotFound { path: parent },
            ParentValidationFailure::ChainInvalid { parent, reason } => {
                Self::ParentCycleOrTooDeep {
                    file_path: parent,
                    reason,
                }
            }
        }
    }
}

impl From<ParentValidationFailure> for UpdateTaskCommandError {
    fn from(f: ParentValidationFailure) -> Self {
        Self::Validation(UpdateTaskError::from(f))
    }
}

impl From<TaskIoError> for UpdateTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => UpdateTaskCommandError::Io(source),
        }
    }
}

impl From<TaskContentError> for UpdateTaskError {
    fn from(err: TaskContentError) -> Self {
        let reason = match err {
            TaskContentError::TooLarge { size, .. } => ContentRejectReason::TooLarge { size },
            TaskContentError::BinaryDetected { .. } => ContentRejectReason::BinaryDetected,
        };
        Self::ContentNotScannerEligible { reason }
    }
}

impl From<TaskParseError> for UpdateTaskError {
    fn from(err: TaskParseError) -> Self {
        match err {
            TaskParseError::CycleOrTooDeep { file_path, reason } => {
                Self::ParentCycleOrTooDeep { file_path, reason }
            }
            TaskParseError::NotTask => Self::ParseFailed("no frontmatter found".to_string()),
            TaskParseError::Frontmatter(e) => Self::ParseFailed(e.to_string()),
        }
    }
}
