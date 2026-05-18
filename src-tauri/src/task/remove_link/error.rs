//! `remove_link` のエラー型。
//!
//! 公開 `remove_link` command は `Result<Task, String>` を返すため、
//! `RemoveLinkCommandError` 自体は Serialize を実装しない。
//! `remove_link_impl(...).map_err(|e| e.to_string())` で文字列化する
//! （既存 `add_link` / `update_task` と同型）。

use std::path::PathBuf;

use thiserror::Error;

use crate::state::AppStateError;
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
    /// 効果層側で具体的な NotFound 等を `SourceNotFound` に詰め直す途中で使う path 形式。
    #[error("file not found: {}", .0.display())]
    FileNotFound(PathBuf),
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
