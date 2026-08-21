//! task アーカイブドメイン親。
//!
//! Done になったタスクをボード・走査対象から外しつつファイルとして保持する
//! `archive_task` / `get_archived_tasks` / `unarchive_task` を提供する。

pub mod args;
pub mod command;
pub mod error;
