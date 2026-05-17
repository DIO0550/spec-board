//! `delete_task` Tauri command のファサード。
//!
//! 現時点では aggregate validation のエラー型のみを公開する。IPC コマンド本体
//! （`command.rs` / `args.rs`）は後続 Issue で追加する。

pub mod error;
