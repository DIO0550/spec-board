//! `create_task` Tauri command 系のサブモジュール群。
//!
//! 外部 (lib.rs / FE) からは従来通り `crate::task::create::create_task` 等の
//! パスでアクセスできるよう、子モジュールのシンボルを `pub use` で再エクスポートする。

pub mod args;
pub mod command;
pub mod content;
pub mod error;
pub mod filename;
pub mod usecase;

pub use args::CreateTaskArgs;
#[allow(unused_imports)]
pub use command::{__cmd__create_task, create_task};
pub use error::{ContentRejectReason, CreateTaskCommandError, CreateTaskError};
pub use filename::build_new_filename;

#[allow(unused_imports)]
pub(crate) use command::create_task_impl;
