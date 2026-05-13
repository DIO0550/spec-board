//! `create_task` のエラー型。
//!
//! FE 側 `TauriError.PATTERNS` で文字列マッチされるため、Display 文字列は変更しない。

use std::fmt;

use thiserror::Error;

use crate::state::AppStateError;
use crate::task::frontmatter::FrontmatterError;
use crate::task::task_index::{ParentHierarchyErrorReason, ParentValidationFailure};
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CreateTaskError {
    #[error("タイトルからファイル名を生成できません")]
    InvalidTitle,
    #[error("親タスクが見つかりません: {parent}")]
    ParentNotFound { parent: String },
    #[error("親タスクのチェーン検証に失敗しました ({parent}): {reason}")]
    ParentCycleOrTooDeep {
        parent: String,
        reason: ParentHierarchyErrorReason,
    },
    #[error("作成しようとしたタスク本文が scanner の対象外です: {reason}")]
    ContentNotScannerEligible { reason: ContentRejectReason },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentRejectReason {
    TooLarge { size: u64 },
    BinaryDetected,
}

impl fmt::Display for ContentRejectReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge { size } => {
                write!(f, "本文サイズが 1 MiB を超えています ({size} byte)")
            }
            Self::BinaryDetected => write!(f, "本文の先頭 8 KiB に NUL byte が含まれています"),
        }
    }
}

#[derive(Debug, Error)]
pub enum CreateTaskCommandError {
    #[error(transparent)]
    Validation(#[from] CreateTaskError),
    #[error("project is not opened")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),
    #[error("failed to write task file: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

impl From<ParentValidationFailure> for CreateTaskError {
    fn from(f: ParentValidationFailure) -> Self {
        match f {
            ParentValidationFailure::NotFound { parent } => Self::ParentNotFound { parent },
            ParentValidationFailure::ChainInvalid { parent, reason } => {
                Self::ParentCycleOrTooDeep { parent, reason }
            }
        }
    }
}

impl From<ParentValidationFailure> for CreateTaskCommandError {
    fn from(f: ParentValidationFailure) -> Self {
        Self::Validation(CreateTaskError::from(f))
    }
}
