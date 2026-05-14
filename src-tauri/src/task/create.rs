//! `create_task` Tauri command 系のサブモジュール群。
//!
//! 外部 (lib.rs / FE) からは従来通り `crate::task::create::create_task` 等の
//! パスでアクセスできるよう、子モジュールのシンボルを `pub use` で再エクスポートする。
//!
//! 構造:
//! - `args`: IPC 境界の DTO (`CreateTaskArgs`) + `From<CreateTaskArgs> for CreateTaskIntent`
//! - `command`: Tauri command 薄層 + effect 層 (`create_task_impl`)
//! - `error`: IPC エラー (`CreateTaskCommandError`) と純粋ドメインエラー (`CreateTaskError`)
//!
//! 純粋計算 (planning) は domain 側の `TaskIndex::plan_create` に集約済み。
//! 当ディレクトリには application 層のみ残す。

pub mod args;
pub mod command;
pub mod error;

pub use args::CreateTaskArgs;
#[allow(unused_imports)]
pub use command::{__cmd__create_task, create_task};
pub use error::{ContentRejectReason, CreateTaskCommandError, CreateTaskError};

#[allow(unused_imports)]
pub(crate) use command::create_task_impl;
