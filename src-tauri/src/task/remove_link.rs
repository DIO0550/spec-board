//! `remove_link` Tauri command のファサード。

pub mod args;
pub mod command;
pub mod error;

// `__cmd__remove_link` は `tauri::generate_handler!` マクロが名前で展開して参照する
// シンボルで、ソース上には明示的な利用箇所が現れない。そのままだと未使用と判定
// されるため、マクロ経由で使われることを前提に未使用 import の警告を抑止する。
#[allow(unused_imports)]
pub use command::{__cmd__remove_link, remove_link};

// `remove_link_impl` は effect 層の本体で、テストや特定ビルド構成からのみ参照され
// 通常ビルドでは利用箇所が現れないことがあるため、未使用 import の警告を抑止する。
#[allow(unused_imports)]
pub(crate) use command::remove_link_impl;
