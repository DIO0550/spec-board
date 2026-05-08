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
/// `stop()` 実装が panic した場合、`AppState` は呼び出し中に保持していた
/// `Mutex` の guard 経由で poison 状態に遷移する。次回アクセサ呼び出しで
/// `LockPoisoned` エラーが返る運用を前提とする。
pub trait WatcherHandle: Send {
    /// watcher を停止し、内部リソース（スレッド・OS ハンドル等）を解放する。
    fn stop(&mut self);
}

#[cfg(test)]
mod tests {
    use super::WatcherHandle;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    struct FakeHandle {
        stop_calls: Arc<AtomicUsize>,
    }

    impl WatcherHandle for FakeHandle {
        fn stop(&mut self) {
            self.stop_calls.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn trait_object_dispatches_stop_to_concrete_impl() {
        let counter = Arc::new(AtomicUsize::new(0));
        let mut handle: Box<dyn WatcherHandle> = Box::new(FakeHandle {
            stop_calls: Arc::clone(&counter),
        });

        (*handle).stop();
        (*handle).stop();

        assert_eq!(2, counter.load(Ordering::SeqCst));
    }

    #[test]
    fn watcher_handle_box_is_send() {
        fn assert_send<T: Send>() {}
        assert_send::<Box<dyn WatcherHandle + Send + 'static>>();
    }
}
