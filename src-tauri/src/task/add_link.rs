//! `add_link` Tauri command のファサード。

pub mod args;
pub mod command;
pub mod error;

#[allow(unused_imports)]
pub use command::{__cmd__add_link, add_link};

#[allow(unused_imports)]
pub(crate) use command::add_link_impl;
