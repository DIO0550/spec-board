//! `archive_task` / `get_archived_tasks` / `unarchive_task` のエラー型。
//!
//! Display は FE でそのまま toast に併記されるため、ユーザーが読める日本語にする
//! （delete_task の英文パターンとは異なり、FE `TauriError.PATTERNS` の専用分類に
//! 依存しない。分類は UNKNOWN のままでよく、文言だけで意味が伝わることを優先する）。

use std::path::PathBuf;

use thiserror::Error;

use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::io::TaskIoError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

/// aggregate validation + command 層 validation のエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ArchiveTaskError {
    /// 子タスクを持つタスクはアーカイブできない（delete_task の abort 契約と同型）。
    #[error(
        "子タスクが存在するためアーカイブできません: {path}（子: {}）",
        .children.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
    )]
    HasChildren {
        path: String,
        children: Vec<PathBuf>,
    },
    #[error("ファイルパスが不正です: {0}")]
    InvalidPath(String),
    #[error("対象のタスクが見つかりません: {}", .0.display())]
    FileNotFound(PathBuf),
    /// アーカイブ先の空き名を確保できなかった（連番リトライ上限到達）。
    #[error("アーカイブ先のファイル名を確保できませんでした: {}", .0.display())]
    DestinationUnavailable(PathBuf),
}

/// `unarchive_task` の validation エラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum UnarchiveTaskError {
    #[error("ファイルパスが不正です: {0}")]
    InvalidPath(String),
    #[error("アーカイブされたタスクが見つかりません: {}", .0.display())]
    FileNotFound(PathBuf),
    #[error("復元先のファイル名を確保できませんでした: {}", .0.display())]
    DestinationUnavailable(PathBuf),
}

/// `archive_task` IPC command の全エラー経路。
#[derive(Debug, Error)]
pub enum ArchiveTaskCommandError {
    #[error(transparent)]
    Validation(#[from] ArchiveTaskError),
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),
    #[error("タスクファイルの移動に失敗しました: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    SessionConflict(#[from] SessionConflict),
    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),
    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),
}

impl From<SessionWriteError> for ArchiveTaskCommandError {
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

impl From<TaskIoError> for ArchiveTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => ArchiveTaskCommandError::Io(source),
        }
    }
}

/// `unarchive_task` IPC command の全エラー経路。
///
/// unarchive は resident cache を変更しない（復元ファイルの取り込みは watcher に
/// 委ねる）ため、session write 系のエラーは持たない。
#[derive(Debug, Error)]
pub enum UnarchiveTaskCommandError {
    #[error(transparent)]
    Validation(#[from] UnarchiveTaskError),
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error("タスクファイルの移動に失敗しました: {0}")]
    Io(#[from] std::io::Error),
}

impl From<TaskIoError> for UnarchiveTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => UnarchiveTaskCommandError::Io(source),
        }
    }
}

/// `get_archived_tasks` IPC command のエラー。
#[derive(Debug, Error)]
pub enum GetArchivedTasksError {
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error("アーカイブ一覧の取得に失敗しました: {0}")]
    Scan(#[from] spec_board_fs::task::file_scanner::ScanError),
}
