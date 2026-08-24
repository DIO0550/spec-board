use super::{NoopWatcherHandle, WatcherHandle};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

struct FakeHandle {
    stop_calls: Arc<AtomicUsize>,
}

impl WatcherHandle for FakeHandle {
    fn stop(self: Box<Self>) {
        self.stop_calls.fetch_add(1, Ordering::SeqCst);
    }
}

#[test]
fn trait_object_dispatches_stop_to_concrete_impl() {
    let counter = Arc::new(AtomicUsize::new(0));
    let handle: Box<dyn WatcherHandle> = Box::new(FakeHandle {
        stop_calls: Arc::clone(&counter),
    });

    handle.stop();

    assert_eq!(1, counter.load(Ordering::SeqCst));
}

#[test]
fn watcher_handle_box_is_send() {
    fn assert_send<T: Send>() {}
    assert_send::<Box<dyn WatcherHandle + Send + 'static>>();
}

#[test]
fn noop_watcher_handle_stop_does_not_panic() {
    let handle: Box<dyn WatcherHandle> = Box::new(NoopWatcherHandle::new());

    handle.stop();
}
