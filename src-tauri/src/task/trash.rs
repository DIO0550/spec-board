//! task ゴミ箱ドメイン親。
//!
//! `delete_task` のソフトデリート先である `.spec-board/trash/` の一覧・復元・
//! 完全削除（`get_trashed_tasks` / `restore_trashed_task` / `purge_trashed_task` /
//! `empty_trash`）を提供する。

pub mod args;
pub mod command;
pub mod error;
