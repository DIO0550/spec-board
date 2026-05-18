//! `remove_link` Tauri command のファサード。

pub mod args;
pub mod command;
pub mod error;

#[allow(unused_imports)]
pub use command::{__cmd__remove_link, remove_link};

#[allow(unused_imports)]
pub(crate) use command::remove_link_impl;
