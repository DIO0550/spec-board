//! `delete_task` aggregate validation のエラー型。
//!
//! `TaskIndex::plan_delete_abort` が返す失敗値のみを保持する。effect 層
//! （I/O / cache / watcher 連携）の失敗を表す型は未実装。
//!
//! Display 文字列は FE 側 `TauriError.PATTERNS` で文字列マッチされるため、
//! create_task / update_task と同じ自然文パターンを採用する。

use std::path::PathBuf;

use thiserror::Error;

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
}
