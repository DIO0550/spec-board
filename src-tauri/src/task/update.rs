//! `update_task` Tauri command のファサード。

pub mod args;
pub mod command;
pub mod error;

#[allow(unused_imports)]
pub use command::{__cmd__update_task, update_task};

#[allow(unused_imports)]
pub(crate) use command::update_task_impl;
