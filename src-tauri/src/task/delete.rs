//! `delete_task` Tauri command のファサード。

pub mod args;
pub mod command;
pub mod error;

#[allow(unused_imports)]
pub use command::{__cmd__delete_task, delete_task};

#[allow(unused_imports)]
pub(crate) use command::delete_task_impl;
