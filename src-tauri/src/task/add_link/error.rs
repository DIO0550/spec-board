//! `add_link` のエラー型。
//!
//! 公開 `add_link` command は `Result<Task, String>` を返すため、`AddLinkCommandError`
//! 自体は Serialize を実装しない。`add_link_impl(...).map_err(|e| e.to_string())` で
//! 文字列化する（既存 `update_task` と同型）。

use thiserror::Error;

use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::io::TaskIoError;
use crate::task::parse::TaskParseError;
use crate::task::task_content::TaskContentError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

pub use crate::task::create::error::ContentRejectReason;

#[derive(Debug, Clone, Error, PartialEq, Eq)]
pub enum AddLinkError {
    #[error("source task not found: {path}")]
    SourceNotFound { path: String },
    #[error("target task not found: {path}")]
    TargetNotFound { path: String },
    #[error("self link not allowed: {path}")]
    SelfLink { path: String },
    /// frontmatter parse 失敗（先頭 delimiter 不在 / YAML 構文エラー等）。
    /// effect 層から effect 由来エラーとして渡される（aggregate 自身は parse を実行しない）。
    #[error("parse failed: {0}")]
    ParseFailed(String),
    /// commit 時点で snapshot にあった source が cache から消えていた場合に返す。
    #[error("source vanished from cache during commit: {path}")]
    SourceVanished { path: String },
    /// commit 時点で snapshot にあった target が cache から消えていた場合に返す。
    #[error("target vanished from cache during commit: {path}")]
    TargetVanished { path: String },
    /// `TaskDocument::render` 後の本文が scanner eligible でない場合。
    #[error("content not scanner eligible: {reason}")]
    ContentRejected { reason: ContentRejectReason },
    #[error("task document render failed: {0}")]
    DocumentRender(String),
}

#[derive(Debug, Error)]
pub enum AddLinkCommandError {
    #[error(transparent)]
    Validation(#[from] AddLinkError),
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
    #[error(transparent)]
    Resolution(#[from] TaskParseError),
}

impl From<SessionWriteError> for AddLinkCommandError {
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

impl From<TaskIoError> for AddLinkCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => AddLinkCommandError::Io(source),
        }
    }
}

impl From<TaskContentError> for AddLinkError {
    fn from(err: TaskContentError) -> Self {
        let reason = match err {
            TaskContentError::TooLarge { size, .. } => ContentRejectReason::TooLarge { size },
            TaskContentError::BinaryDetected { .. } => ContentRejectReason::BinaryDetected,
        };
        AddLinkError::ContentRejected { reason }
    }
}
