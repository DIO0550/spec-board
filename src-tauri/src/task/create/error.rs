//! `create_task` のエラー型。
//!
//! FE 側 `TauriError.PATTERNS` で文字列マッチされるため、Display 文字列は変更しない。

use std::fmt;

use thiserror::Error;

use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::frontmatter::FrontmatterError;
use crate::task::io::TaskIoError;
use crate::task::task_file_name::TaskFileNameError;
use crate::task::task_index::{ParentHierarchyErrorReason, ParentValidationFailure};
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CreateTaskError {
    #[error("タイトルからファイル名を生成できません")]
    InvalidTitle,
    /// 明示指定されたファイル名が不正（空 / パスセパレータ含み / 非 `.md` 拡張子）。
    #[error("invalid file name: {0}")]
    InvalidFileName(String),
    #[error("親タスクが見つかりません: {parent}")]
    ParentNotFound { parent: String },
    #[error("親タスクのチェーン検証に失敗しました ({parent}): {reason}")]
    ParentCycleOrTooDeep {
        parent: String,
        reason: ParentHierarchyErrorReason,
    },
    #[error("作成しようとしたタスク本文が scanner の対象外です: {reason}")]
    ContentNotScannerEligible { reason: ContentRejectReason },
    #[error("task document render failed: {reason}")]
    DocumentRender { reason: String },
}

impl CreateTaskError {
    /// 明示ファイル名経路の `TaskFileNameError` を `InvalidFileName` に変換する。
    /// エラー原因の種別（空 / セパレータ / 非 `.md`）を detail 文字列に含める。
    pub(crate) fn from_file_name_error(err: TaskFileNameError) -> Self {
        Self::InvalidFileName(err.to_string())
    }
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
    #[error(transparent)]
    Document(#[from] crate::task::document::TaskDocumentError),
    #[error(transparent)]
    SessionConflict(#[from] SessionConflict),
    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),
    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),
}

impl From<SessionWriteError> for CreateTaskCommandError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(error) => Self::AppState(error),
            SessionWriteError::Conflict(error) => Self::SessionConflict(error),
            SessionWriteError::RevisionExhausted(error) => Self::RevisionExhausted(error),
            SessionWriteError::ResourceConflict(error) => Self::ResourceConflict(error),
        }
    }
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

impl From<TaskIoError> for CreateTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => CreateTaskCommandError::Io(source),
        }
    }
}
