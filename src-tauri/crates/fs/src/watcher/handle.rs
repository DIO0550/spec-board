//! ファイルシステム watcher の停止契約を表す trait 定義。
//!
//! `notify` 等の重い外部 crate 型を境界に出さないため、本ファイルでは `std`
//! のみで `WatcherHandle` を定義する。具体実装は `notify` を使うサブモジュール
//! 側で提供する。

/// 実行中のファイルシステム watcher を停止できるハンドル。
///
/// 実装は通常、内部スレッド / OS イベントソースを保持し、`stop()` 呼び出しで
/// それらを解放する。`stop()` はhandleを消費し、明示的な二重停止を型で禁止する。
///
/// # Panic
///
/// 第三者実装の`stop()`はpanicし得る。consuming stopはpanic後にretryできないため、
/// 本体callerは所有handleを全lock外へ取り出してから`catch_unwind`で境界を隔離する。
///
/// 明示的な停止はhandleを消費するため、同じhandleを二重停止できない。
///
/// ```compile_fail,E0382
/// use spec_board_fs::watcher::handle::{NoopWatcherHandle, WatcherHandle};
///
/// let handle: Box<dyn WatcherHandle> = Box::new(NoopWatcherHandle::new());
/// handle.stop();
/// handle.stop();
/// ```
pub trait WatcherHandle: Send {
    /// watcher を停止し、内部リソース（スレッド・OS ハンドル等）を解放する。
    fn stop(self: Box<Self>);
}

/// 何もしない [`WatcherHandle`] 実装。
///
/// notify 等の具象 watcher が未導入の段階で、ハンドルを保持する呼び出し側に
/// 渡せる最小実装として用いる。
#[derive(Debug, Default)]
pub struct NoopWatcherHandle;

impl NoopWatcherHandle {
    /// 新しい no-op ハンドルを返す。
    pub fn new() -> Self {
        Self
    }
}

impl WatcherHandle for NoopWatcherHandle {
    fn stop(self: Box<Self>) {}
}

#[cfg(test)]
#[path = "handle_tests.rs"]
mod handle_tests;
