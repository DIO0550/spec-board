//! `delete_task` のエラー型。
//!
//! Display 文字列は FE 側 `TauriError.PATTERNS` で文字列マッチされるため、
//! create_task / update_task と同じ自然文パターンを採用する。

use std::path::PathBuf;

use thiserror::Error;

use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::io::TaskIoError;
use crate::task::parse::TaskParseError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

/// aggregate validation + command 層 validation のエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DeleteTaskError {
    #[error(
        "task has children: {path} (children: {})",
        .children.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
    )]
    HasChildren {
        path: String,
        children: Vec<PathBuf>,
    },
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("file not found: {}", .0.display())]
    FileNotFound(PathBuf),
    #[error("unsupported orphan strategy: {0}")]
    UnsupportedOrphanStrategy(String),
    /// ゴミ箱への退避先の空き名を確保できなかった（連番リトライ上限到達）。
    #[error("ゴミ箱への退避先を確保できませんでした: {}", .0.display())]
    TrashDestinationUnavailable(PathBuf),
}

/// IPC command の全エラー経路。
#[derive(Debug, Error)]
pub enum DeleteTaskCommandError {
    #[error(transparent)]
    Validation(#[from] DeleteTaskError),
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

impl From<SessionWriteError> for DeleteTaskCommandError {
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

impl From<TaskIoError> for DeleteTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => DeleteTaskCommandError::Io(source),
        }
    }
}
