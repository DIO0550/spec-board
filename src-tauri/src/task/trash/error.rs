//! ゴミ箱操作のエラー型。
//!
//! Display は FE でそのまま toast に併記されるため、ユーザーが読める日本語にする
//! （archive 系と同じ方針。FE `TauriError.PATTERNS` の専用分類には依存しない）。

use std::path::PathBuf;

use thiserror::Error;

use crate::state::AppStateError;
use crate::task::io::TaskIoError;

/// `restore_trashed_task` の validation エラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum RestoreTrashedTaskError {
    #[error("ファイルパスが不正です: {0}")]
    InvalidPath(String),
    #[error("ゴミ箱にタスクが見つかりません: {}", .0.display())]
    FileNotFound(PathBuf),
    #[error("復元先のファイル名を確保できませんでした: {}", .0.display())]
    DestinationUnavailable(PathBuf),
}

/// `restore_trashed_task` IPC command の全エラー経路。
///
/// unarchive_task と同じく resident cache を変更しない（復元ファイルの取り込みは
/// watcher に委ねる）ため、session write 系のエラーは持たない。
#[derive(Debug, Error)]
pub enum RestoreTrashedTaskCommandError {
    #[error(transparent)]
    Validation(#[from] RestoreTrashedTaskError),
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error("タスクファイルの移動に失敗しました: {0}")]
    Io(#[from] std::io::Error),
}

impl From<TaskIoError> for RestoreTrashedTaskCommandError {
    fn from(err: TaskIoError) -> Self {
        match err {
            TaskIoError::Io(source) => RestoreTrashedTaskCommandError::Io(source),
        }
    }
}

/// `purge_trashed_task` / `empty_trash` IPC command のエラー。
#[derive(Debug, Error)]
pub enum PurgeTrashError {
    #[error("ファイルパスが不正です: {0}")]
    InvalidPath(String),
    #[error("ゴミ箱にタスクが見つかりません: {}", .0.display())]
    FileNotFound(PathBuf),
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error("ゴミ箱の削除に失敗しました: {0}")]
    Io(#[from] std::io::Error),
}

/// `get_trashed_tasks` IPC command のエラー。
#[derive(Debug, Error)]
pub enum GetTrashedTasksError {
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    #[error("ゴミ箱一覧の取得に失敗しました: {0}")]
    Scan(#[from] spec_board_fs::task::file_scanner::ScanError),
}
