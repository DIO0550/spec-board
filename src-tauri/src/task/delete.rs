//! `delete_task` Tauri command のファサード。
//!
//! 現状は aggregate validation のエラー型のみを公開する。IPC コマンド本体
//! （`command.rs` / `args.rs`）は未実装。

pub mod error;
