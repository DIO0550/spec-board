//! ファイルシステム watcher の停止契約を表す trait 定義。
//!
//! `notify` 等の重い外部 crate 型を境界に出さないため、本ファイルでは `std`
//! のみで `WatcherHandle` を定義する。具体実装は `notify` を使うサブモジュール
//! 側で提供する。

/// 実行中のファイルシステム watcher を停止できるハンドル。
///
/// 実装は通常、内部スレッド / OS イベントソースを保持し、`stop()` 呼び出しで
/// それらを解放する。`stop()` は冪等であることが望ましい（複数回呼んでも
/// panic しない）。
///
/// # Panic
///
/// 一般に `stop()` の panic safety は呼び出し側の責務である。呼び出し側が
/// 内部 Mutex の guard を保持したまま `stop()` を呼び出すケースでは、panic は
/// guard 経由で伝播し Mutex が poison 状態に遷移し得る。その場合は次回の
/// アクセサ呼び出しで lock poison エラーが返る運用を前提とする。
/// 一方、ハンドルを取り出して guard 外から呼び出す場合（例: take 経由）は
/// この限りではなく、呼び出し側で適宜 `catch_unwind` 等を行うこと。
pub trait WatcherHandle: Send {
    /// watcher を停止し、内部リソース（スレッド・OS ハンドル等）を解放する。
    fn stop(&mut self);
}

/// 何もしない [`WatcherHandle`] 実装。
///
/// notify 等の具象 watcher が未導入の段階で、ハンドルを保持する呼び出し側に
/// 渡せる最小実装として用いる。`stop()` は冪等で副作用を持たないため、
/// 同一インスタンスに対して複数回呼び出しても安全。
#[derive(Debug, Default)]
pub struct NoopWatcherHandle;

impl NoopWatcherHandle {
    /// 新しい no-op ハンドルを返す。
    pub fn new() -> Self {
        Self
    }
}

impl WatcherHandle for NoopWatcherHandle {
    fn stop(&mut self) {
        // 何もしない（冪等性のため複数回呼ばれてよい）。
    }
}

#[cfg(test)]
#[path = "handle_tests.rs"]
mod handle_tests;
