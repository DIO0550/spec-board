//! `remove_link` のエラー型。
//!
//! 公開 `remove_link` command は `Result<Task, String>` を返すため、
//! `RemoveLinkCommandError` 自体は Serialize を実装しない。
//! `remove_link_impl(...).map_err(|e| e.to_string())` で文字列化する
//! （既存 `add_link` / `update_task` と同型）。

use thiserror::Error;

use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::io::TaskIoError;
use crate::task::task_content::TaskContentError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

pub use crate::task::create::error::ContentRejectReason;

#[derive(Debug, Clone, Error, PartialEq, Eq)]
pub enum RemoveLinkError {
    #[error("source task not found: {path}")]
    SourceNotFound { path: String },
    /// args 段階で target path が空文字 / traversal / project_root 外だった場合。
    /// add_link と異なり aggregate で「target が存在するか」は検証しないため、
    /// 不正 path はここに集約される。
    #[error("invalid target path: {path}")]
    InvalidTargetPath { path: String },
    /// frontmatter parse 失敗。effect 層から渡される。
    #[error("parse failed: {0}")]
    ParseFailed(String),
    /// commit 時点で snapshot にあった source が cache から消えていた場合。
    #[error("source vanished from cache during commit: {path}")]
    SourceVanished { path: String },
    /// `frontmatter::serialize` 後の本文が scanner eligible でない場合。
    #[error("content not scanner eligible: {reason}")]
    ContentRejected { reason: ContentRejectReason },
}

#[derive(Debug, Error)]
pub enum RemoveLinkCommandError {
    #[error(transparent)]
    Validation(#[from] RemoveLinkError),
    #[error("project is not opened")]
    NoProjectOpen,
    #[error("internal state lock poisoned")]
    AppState(#[from] AppStateError),
    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    SessionConflict(#[from] SessionConflict),
    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),
    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),
}

impl From<SessionWriteError> for RemoveLinkCommandError {
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

impl From<TaskIoError> for RemoveLinkCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => RemoveLinkCommandError::Io(source),
        }
    }
}

impl From<TaskContentError> for RemoveLinkError {
    fn from(err: TaskContentError) -> Self {
        let reason = match err {
            TaskContentError::TooLarge { size, .. } => ContentRejectReason::TooLarge { size },
            TaskContentError::BinaryDetected { .. } => ContentRejectReason::BinaryDetected,
        };
        RemoveLinkError::ContentRejected { reason }
    }
}
