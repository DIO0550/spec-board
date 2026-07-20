//! `delete_task` のエラー型。
//!
//! Display 文字列は FE 側 `TauriError.PATTERNS` で文字列マッチされるため、
//! create_task / update_task と同じ自然文パターンを採用する。

use std::path::PathBuf;

use thiserror::Error;

use crate::state::AppStateError;
use crate::task::io::TaskIoError;
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
}

impl From<TaskIoError> for DeleteTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => DeleteTaskCommandError::Io(source),
        }
    }
}
