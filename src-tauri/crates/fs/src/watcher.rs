//! Recursive file system watcher built on top of the `notify` crate.
//!
//! The public API hides every `notify::*` type so that callers depend only
//! on `std` types and the [`FsEvent`] / [`WatcherError`] declared in this
//! module. Backends are selected automatically: `RecommendedWatcher` first,
//! falling back to `PollWatcher` (2-second interval) when either
//! initialization or recursive `watch()` fails.
//!
//! Stopping is synchronous via `Drop`: the backend is released, then the
//! adapter thread is joined. After `Drop` returns, no NEW file change will
//! produce an event, but events already queued by the adapter remain
//! drainable from the receiver until `Disconnected` is observed.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use notify::event::{EventKind, ModifyKind};
use notify::{
    Config as NotifyConfig, Event as NotifyEvent, EventHandler, PollWatcher, RecommendedWatcher,
    RecursiveMode, Watcher as NotifyWatcher,
};
use thiserror::Error;

const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// File system event surfaced to callers.
///
/// `notify::Event` payloads are translated into one of the variants below.
/// Renames are emitted as a single [`FsEvent::Renamed`] when the underlying
/// `notify::Event` carries both source and destination paths; otherwise the
/// event is downgraded to [`FsEvent::Other`] with the first path.
/// Runtime errors from the underlying `notify` backend are surfaced as
/// [`FsEvent::Error`] rather than being silently dropped. When the backend
/// reports queue overflow / event coalescing via `notify::Event::need_rescan()`
/// the watcher emits [`FsEvent::Rescan`] so that callers can rebuild their
/// state instead of remaining permanently out of sync with the filesystem.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FsEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
    Renamed {
        from: PathBuf,
        to: PathBuf,
    },
    Other(PathBuf),
    Error(String),
    /// Backend signaled that prior events may have been missed (queue
    /// overflow / coalescing). Callers must rescan / rebuild state.
    Rescan,
}

/// Errors returned from [`Watcher::start`].
#[derive(Debug, Error)]
pub enum WatcherError {
    #[error("failed to initialize file system watcher: {0}")]
    Init(String),
    #[error("watch path does not exist or is not a directory: `{}`", .0.display())]
    PathNotFound(PathBuf),
    #[error("io error while preparing watcher: {0}")]
    Io(#[from] std::io::Error),
}

/// Backend variant that owns the underlying `notify` watcher and keeps the
/// OS-level watch threads alive while the [`Watcher`] is held. The inner
/// values are never read directly — they are kept alive so that dropping
/// this enum tears down the OS-level watch.
pub(crate) enum Backend {
    Recommended(#[allow(dead_code)] RecommendedWatcher),
    Poll(#[allow(dead_code)] PollWatcher),
}

/// Recursive file system watcher. Drop the value to stop watching
/// synchronously: the OS-level backend is released first, then the adapter
/// thread is joined. Any file change that occurs **after** `Drop` returns
/// will not be delivered to the receiver. Events that the adapter had
/// already enqueued before Drop may still be drained from the receiver
/// until it observes `Disconnected`.
pub struct Watcher {
    backend: Option<Backend>,
    adapter_handle: Option<JoinHandle<()>>,
}

impl Watcher {
    /// Start watching `path` recursively, returning the watcher and a
    /// receiver that yields translated [`FsEvent`] values.
    ///
    /// The implementation tries `RecommendedWatcher` first. If either
    /// `new` or `watch` fails (e.g. inotify limit on Linux), it falls back
    /// to `PollWatcher` with a 2-second poll interval.
    ///
    /// # Errors
    ///
    /// - [`WatcherError::PathNotFound`] when `path` does not exist or is not a directory
    /// - [`WatcherError::Io`] when metadata retrieval fails for I/O reasons
    /// - [`WatcherError::Init`] when both the recommended and poll backends
    ///   fail to initialize or to begin recursive watching; the error
    ///   message contains both backends' contexts
    pub fn start(path: impl AsRef<Path>) -> Result<(Self, Receiver<FsEvent>), WatcherError> {
        let path = path.as_ref();
        validate_path(path)?;

        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend = build_backend(notify_tx, path)?;
        let (fs_rx, handle) = spawn_adapter(notify_rx);

        Ok((
            Self {
                backend: Some(backend),
                adapter_handle: Some(handle),
            },
            fs_rx,
        ))
    }

    /// Test-only entry point that forces the [`PollWatcher`] backend so
    /// CI on Linux (where inotify initialization always succeeds) can still
    /// exercise the fallback path.
    ///
    /// # Errors
    ///
    /// - [`WatcherError::PathNotFound`] when `path` does not exist or is not a directory
    /// - [`WatcherError::Io`] when metadata retrieval fails for I/O reasons
    /// - [`WatcherError::Init`] when the poll backend fails to initialize
    ///   or begin recursive watching
    #[cfg(test)]
    pub(crate) fn start_with_poll(
        path: impl AsRef<Path>,
    ) -> Result<(Self, Receiver<FsEvent>), WatcherError> {
        let path = path.as_ref();
        validate_path(path)?;

        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend = build_poll_backend(notify_tx, path)
            .map_err(|e| WatcherError::Init(format!("poll backend failed: {e}")))?;
        let (fs_rx, handle) = spawn_adapter(notify_rx);

        Ok((
            Self {
                backend: Some(backend),
                adapter_handle: Some(handle),
            },
            fs_rx,
        ))
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        // Drop the backend first. This shuts down notify's internal OS
        // thread and releases the Sender clones held by the event handler
        // closure. Once every Sender to `notify_tx` is gone, the adapter
        // thread's `recv()` returns Err and the loop exits.
        self.backend.take();

        // Join the adapter thread so callers observe a clean stop. After
        // `drop` returns, no NEW file change will produce an FsEvent.
        // Already-queued events may still be drained from `fs_rx` until
        // `Disconnected` is observed.
        if let Some(handle) = self.adapter_handle.take() {
            let _ = handle.join();
        }
    }
}

/// Verify that `path` exists and is a directory.
///
/// Performs the existence and directory-type check in a single `metadata()`
/// call so that a TOCTOU race between checks (e.g. the directory being
/// removed mid-call) is mapped to [`WatcherError::PathNotFound`] instead of
/// leaking through as a generic [`WatcherError::Io`]. Symlink directories
/// are accepted; the recursion policy for descendant symlinks is enforced
/// by [`notify_config`] (no follow).
fn validate_path(path: &Path) -> Result<(), WatcherError> {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        Ok(_) => Err(WatcherError::PathNotFound(path.to_path_buf())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(WatcherError::PathNotFound(path.to_path_buf()))
        }
        Err(e) => Err(WatcherError::Io(e)),
    }
}

/// Two-stage fallback wrapper that delegates to [`build_backend_with`] with
/// the real backend constructors. Kept as a thin shim so the underlying
/// fallback policy is directly testable without OS resources.
fn build_backend(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, WatcherError> {
    build_backend_with(tx, path, try_build_recommended, build_poll_backend)
}

/// Decide which backend to use, with constructor functions injected so the
/// fallback policy (recommended → poll on failure of either `new` or
/// `watch`) can be unit-tested deterministically without real watchers.
pub(crate) fn build_backend_with<R, P>(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
    try_recommended: R,
    try_poll: P,
) -> Result<Backend, WatcherError>
where
    R: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> Result<Backend, String>,
    P: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> Result<Backend, String>,
{
    let recommended_err = match try_recommended(tx.clone(), path) {
        Ok(backend) => return Ok(backend),
        Err(e) => e,
    };
    match try_poll(tx, path) {
        Ok(backend) => Ok(backend),
        Err(poll_err) => Err(WatcherError::Init(combine_init_errors(
            &recommended_err,
            &poll_err,
        ))),
    }
}

/// Pure formatter for the combined error message returned when both the
/// recommended and the poll backend initialization failed. Extracted so the
/// format is locked in by a unit test (no OS dependency).
pub(crate) fn combine_init_errors(recommended: &str, poll: &str) -> String {
    format!("recommended watcher failed: {recommended}; poll watcher failed: {poll}")
}

fn try_build_recommended(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, String> {
    let mut w =
        RecommendedWatcher::new(forward_handler(tx), notify_config()).map_err(|e| e.to_string())?;
    w.watch(path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(Backend::Recommended(w))
}

fn build_poll_backend(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, String> {
    let config = notify_config().with_poll_interval(POLL_INTERVAL);
    let mut w = PollWatcher::new(forward_handler(tx), config).map_err(|e| e.to_string())?;
    w.watch(path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(Backend::Poll(w))
}

/// Common `notify::Config`: do not follow symlinks while traversing
/// recursively, to avoid runaway loops and crossing project boundaries.
fn notify_config() -> NotifyConfig {
    NotifyConfig::default().with_follow_symlinks(false)
}

/// Build the closure that forwards `notify` results to the adapter thread.
/// If the adapter has exited, the receiver is gone and we silently drop the
/// message because there is no caller to deliver it to.
fn forward_handler(tx: Sender<notify::Result<NotifyEvent>>) -> impl EventHandler {
    move |res: notify::Result<NotifyEvent>| {
        let _ = tx.send(res);
    }
}

/// Spawn the adapter thread that translates `notify::Result<Event>` values
/// into [`FsEvent`] and forwards them to the caller-facing channel. Loop
/// exits when either the upstream sender is dropped (backend released) or
/// the downstream receiver is dropped (caller stopped listening).
fn spawn_adapter(
    notify_rx: Receiver<notify::Result<NotifyEvent>>,
) -> (Receiver<FsEvent>, JoinHandle<()>) {
    let (fs_tx, fs_rx) = mpsc::channel::<FsEvent>();
    let handle = thread::spawn(move || {
        while let Ok(item) = notify_rx.recv() {
            let translated = match item {
                Ok(ev) => convert_event(ev),
                Err(e) => Some(vec![FsEvent::Error(e.to_string())]),
            };
            let Some(events) = translated else { continue };
            for fs_ev in events {
                if fs_tx.send(fs_ev).is_err() {
                    return;
                }
            }
        }
    });
    (fs_rx, handle)
}

/// Translate a single `notify::Event` into zero or more [`FsEvent`] values.
///
/// Pattern match order matters: `Modify(Name(_))` with both source and
/// destination paths must be matched before the generic `Modify(_)` arm so
/// that renames are emitted as [`FsEvent::Renamed`] rather than being
/// downgraded to [`FsEvent::Modified`].
fn convert_event(ev: NotifyEvent) -> Option<Vec<FsEvent>> {
    // Rescan flag must be checked before the empty-paths guard: notify
    // surfaces queue overflow / coalescing without concrete paths, and
    // dropping these would leave callers permanently desynchronized.
    if ev.need_rescan() {
        return Some(vec![FsEvent::Rescan]);
    }
    if ev.paths.is_empty() {
        return None;
    }
    let first = ev.paths[0].clone();
    let translated = match ev.kind {
        EventKind::Create(_) => vec![FsEvent::Created(first)],
        EventKind::Remove(_) => vec![FsEvent::Removed(first)],
        EventKind::Modify(ModifyKind::Name(_)) if ev.paths.len() >= 2 => {
            vec![FsEvent::Renamed {
                from: ev.paths[0].clone(),
                to: ev.paths[1].clone(),
            }]
        }
        // Rename without both endpoints is not actionable as a rename;
        // surface it as `Other` so callers can decide how to react rather
        // than silently treating it as a content modification.
        EventKind::Modify(ModifyKind::Name(_)) => vec![FsEvent::Other(first)],
        EventKind::Modify(_) => vec![FsEvent::Modified(first)],
        _ => vec![FsEvent::Other(first)],
    };
    Some(translated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{
        AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
    };
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::RecvTimeoutError;
    use std::sync::Arc;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

    // ─────────────────────────────────────────────────────────────────
    // helpers
    // ─────────────────────────────────────────────────────────────────

    fn make_files(root: &Path, files: &[&str]) {
        for rel in files {
            let path = root.join(rel);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&path, "").unwrap();
        }
    }

    fn ev_with(kind: EventKind, paths: Vec<PathBuf>) -> NotifyEvent {
        NotifyEvent {
            kind,
            paths,
            attrs: Default::default(),
        }
    }

    fn ev_rescan() -> NotifyEvent {
        NotifyEvent::new(EventKind::Any).set_flag(notify::event::Flag::Rescan)
    }

    /// Wait until any [`FsEvent`] referencing `target_path` is received, or
    /// the timeout elapses.
    fn wait_for_event_at(
        rx: &Receiver<FsEvent>,
        target_path: &Path,
        timeout: Duration,
    ) -> Option<FsEvent> {
        let deadline = Instant::now() + timeout;
        loop {
            let remaining = match deadline.checked_duration_since(Instant::now()) {
                Some(r) if !r.is_zero() => r,
                _ => return None,
            };
            match rx.recv_timeout(remaining) {
                Ok(ev) => {
                    if event_paths(&ev).iter().any(|p| p == target_path) {
                        return Some(ev);
                    }
                }
                Err(_) => return None,
            }
        }
    }

    /// Drop everything that is currently buffered, returning when no new
    /// event arrives for `quiet_window`.
    fn drain_events(rx: &Receiver<FsEvent>, quiet_window: Duration) {
        loop {
            match rx.recv_timeout(quiet_window) {
                Ok(_) => continue,
                Err(_) => return,
            }
        }
    }

    /// Drain events until the channel is `Disconnected`, returning everything
    /// that was queued. Used to verify that no new events arrive after Drop.
    ///
    /// Bounded by `overall_deadline` so that a regression in `Drop`
    /// teardown (or a platform-specific notify quirk) cannot hang the test
    /// suite indefinitely. If `Disconnected` is not observed within the
    /// deadline, the test panics with a clear message.
    fn drain_until_disconnected(
        rx: &Receiver<FsEvent>,
        per_recv_timeout: Duration,
        overall_deadline: Duration,
    ) -> Vec<FsEvent> {
        let mut out = Vec::new();
        let stop_at = Instant::now() + overall_deadline;
        loop {
            let remaining = match stop_at.checked_duration_since(Instant::now()) {
                Some(r) if !r.is_zero() => r,
                _ => panic!(
                    "drain_until_disconnected: channel did not Disconnect within {overall_deadline:?} \
                     (collected {n} events so far)",
                    n = out.len()
                ),
            };
            let next_timeout = std::cmp::min(per_recv_timeout, remaining);
            match rx.recv_timeout(next_timeout) {
                Ok(ev) => out.push(ev),
                Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => return out,
            }
        }
    }

    fn event_paths(ev: &FsEvent) -> Vec<PathBuf> {
        match ev {
            FsEvent::Created(p)
            | FsEvent::Modified(p)
            | FsEvent::Removed(p)
            | FsEvent::Other(p) => vec![p.clone()],
            FsEvent::Renamed { from, to } => vec![from.clone(), to.clone()],
            FsEvent::Error(_) | FsEvent::Rescan => Vec::new(),
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // convert_event: parameterized table
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn convert_event_table() {
        let p1 = PathBuf::from("/tmp/a");
        let p2 = PathBuf::from("/tmp/b");

        struct Case {
            name: &'static str,
            kind: EventKind,
            paths: Vec<PathBuf>,
            expected: Option<Vec<FsEvent>>,
        }

        let cases = vec![
            Case {
                name: "Create -> Created",
                kind: EventKind::Create(CreateKind::File),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Created(p1.clone())]),
            },
            Case {
                name: "Modify(Data) -> Modified",
                kind: EventKind::Modify(ModifyKind::Data(DataChange::Any)),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Modified(p1.clone())]),
            },
            Case {
                name: "Modify(Metadata) -> Modified",
                kind: EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Modified(p1.clone())]),
            },
            Case {
                name: "Modify(Name) + 2 paths -> Renamed",
                kind: EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                paths: vec![p1.clone(), p2.clone()],
                expected: Some(vec![FsEvent::Renamed {
                    from: p1.clone(),
                    to: p2.clone(),
                }]),
            },
            Case {
                name: "Modify(Name) + 1 path -> Other (downgraded)",
                kind: EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Other(p1.clone())]),
            },
            Case {
                name: "Remove -> Removed",
                kind: EventKind::Remove(RemoveKind::File),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Removed(p1.clone())]),
            },
            Case {
                name: "Access -> Other",
                kind: EventKind::Access(AccessKind::Any),
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Other(p1.clone())]),
            },
            Case {
                name: "Any -> Other",
                kind: EventKind::Any,
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Other(p1.clone())]),
            },
            Case {
                name: "Other -> Other",
                kind: EventKind::Other,
                paths: vec![p1.clone()],
                expected: Some(vec![FsEvent::Other(p1.clone())]),
            },
            Case {
                name: "empty paths -> None",
                kind: EventKind::Create(CreateKind::File),
                paths: vec![],
                expected: None,
            },
        ];

        for c in cases {
            let actual = convert_event(ev_with(c.kind, c.paths.clone()));
            assert_eq!(actual, c.expected, "case `{}` failed", c.name);
        }
    }

    #[test]
    fn convert_event_emits_rescan_when_backend_signals_overflow() {
        let actual = convert_event(ev_rescan());
        assert_eq!(
            actual,
            Some(vec![FsEvent::Rescan]),
            "rescan-flagged events must surface as FsEvent::Rescan even when paths are empty"
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // validate_path
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn validate_path_accepts_existing_directory() {
        let dir = TempDir::new().unwrap();
        validate_path(dir.path()).expect("existing directory should be accepted");
    }

    #[test]
    fn validate_path_rejects_missing_path() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("does_not_exist");
        let err = validate_path(&missing).unwrap_err();
        assert!(
            matches!(err, WatcherError::PathNotFound(p) if p == missing),
            "expected PathNotFound for missing path"
        );
    }

    #[test]
    fn validate_path_rejects_regular_file() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["a.md"]);
        let file = dir.path().join("a.md");
        let err = validate_path(&file).unwrap_err();
        assert!(
            matches!(err, WatcherError::PathNotFound(p) if p == file),
            "expected PathNotFound for regular file"
        );
    }

    #[test]
    fn watcher_error_pathnotfound_displays_the_path() {
        let p = PathBuf::from("/no/such/path");
        let err = WatcherError::PathNotFound(p.clone());
        let s = err.to_string();
        assert!(
            s.contains(p.display().to_string().as_str()),
            "error message must include the rejected path; got: {s}"
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // build_backend_with: deterministic fallback unit tests
    // ─────────────────────────────────────────────────────────────────

    /// Build a poll backend for use in tests, returning the [`Backend`] and
    /// the [`TempDir`] guard that owns its watch root. The caller binds both
    /// to a local so the temporary directory is cleaned up when the test
    /// scope ends. Returning the guard avoids the previous `Box::leak`
    /// pattern that permanently leaked memory and on-disk directories.
    fn make_dummy_backend() -> (Backend, TempDir) {
        let dir = TempDir::new().unwrap();
        let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend =
            build_poll_backend(tx, dir.path()).expect("poll backend should build for tests");
        (backend, dir)
    }

    #[test]
    fn build_backend_with_returns_recommended_when_ok() {
        let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let path = PathBuf::from("/tmp");
        let (dummy, _dir_guard) = make_dummy_backend();
        let recommended_called = Arc::new(AtomicBool::new(false));
        let poll_called = Arc::new(AtomicBool::new(false));
        let r_flag = Arc::clone(&recommended_called);
        let p_flag = Arc::clone(&poll_called);
        let _backend = build_backend_with(
            tx,
            &path,
            move |_t, _p| {
                r_flag.store(true, Ordering::SeqCst);
                Ok(dummy)
            },
            move |_t, _p| {
                p_flag.store(true, Ordering::SeqCst);
                Err("poll should not be called".into())
            },
        )
        .expect("should return recommended backend when its constructor succeeds");
        assert!(
            recommended_called.load(Ordering::SeqCst),
            "recommended constructor must be called"
        );
        assert!(
            !poll_called.load(Ordering::SeqCst),
            "poll constructor must not be called when recommended succeeds"
        );
    }

    #[test]
    fn build_backend_with_falls_back_when_recommended_new_fails() {
        let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let path = PathBuf::from("/tmp");
        let (dummy, _dir_guard) = make_dummy_backend();
        let recommended_called = Arc::new(AtomicBool::new(false));
        let poll_called = Arc::new(AtomicBool::new(false));
        let r_flag = Arc::clone(&recommended_called);
        let p_flag = Arc::clone(&poll_called);
        let backend = build_backend_with(
            tx,
            &path,
            move |_t, _p| {
                r_flag.store(true, Ordering::SeqCst);
                Err("new failed: inotify limit".into())
            },
            move |_t, _p| {
                p_flag.store(true, Ordering::SeqCst);
                Ok(dummy)
            },
        )
        .expect("should fall back to poll backend");
        assert!(
            recommended_called.load(Ordering::SeqCst),
            "recommended constructor must be tried first"
        );
        assert!(
            poll_called.load(Ordering::SeqCst),
            "poll constructor must be invoked as fallback"
        );
        assert!(
            matches!(backend, Backend::Poll(_)),
            "fallback must return a Poll backend"
        );
    }

    #[test]
    fn build_backend_with_falls_back_when_recommended_watch_fails() {
        let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let path = PathBuf::from("/tmp");
        let (dummy, _dir_guard) = make_dummy_backend();
        let recommended_called = Arc::new(AtomicBool::new(false));
        let poll_called = Arc::new(AtomicBool::new(false));
        let r_flag = Arc::clone(&recommended_called);
        let p_flag = Arc::clone(&poll_called);
        let backend = build_backend_with(
            tx,
            &path,
            move |_t, _p| {
                r_flag.store(true, Ordering::SeqCst);
                Err("watch failed: too many watches".into())
            },
            move |_t, _p| {
                p_flag.store(true, Ordering::SeqCst);
                Ok(dummy)
            },
        )
        .expect("should fall back to poll backend on watch failure");
        assert!(
            recommended_called.load(Ordering::SeqCst),
            "recommended constructor must be tried first"
        );
        assert!(
            poll_called.load(Ordering::SeqCst),
            "poll constructor must be invoked when watch() fails"
        );
        assert!(
            matches!(backend, Backend::Poll(_)),
            "watch-failure fallback must return a Poll backend"
        );
    }

    #[test]
    fn build_backend_with_returns_init_when_both_fail() {
        let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let path = PathBuf::from("/tmp");
        let result = build_backend_with(
            tx,
            &path,
            |_t, _p| Err("new failed: A".into()),
            |_t, _p| Err("io error: B".into()),
        );
        match result {
            Ok(_) => panic!("expected error when both backends fail"),
            Err(WatcherError::Init(msg)) => {
                assert!(
                    msg.contains("new failed: A"),
                    "missing recommended ctx: {msg}"
                );
                assert!(msg.contains("io error: B"), "missing poll ctx: {msg}");
            }
            Err(other) => panic!("expected Init, got {other:?}"),
        }
    }

    #[test]
    fn combine_init_errors_includes_both_contexts() {
        let s = combine_init_errors("recommended X", "poll Y");
        assert!(s.contains("recommended X"));
        assert!(s.contains("poll Y"));
    }

    // ─────────────────────────────────────────────────────────────────
    // adapter thread: runtime error propagation
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn spawn_adapter_translates_runtime_error_into_fsevent_error() {
        let (tx, rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let (fs_rx, handle) = spawn_adapter(rx);

        let nerr = notify::Error::generic("backend exploded");
        tx.send(Err(nerr)).unwrap();

        let received = fs_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("should receive an error event");
        match received {
            FsEvent::Error(msg) => assert!(
                msg.contains("backend exploded"),
                "error message must include the source: {msg}"
            ),
            other => panic!("expected FsEvent::Error, got {other:?}"),
        }

        drop(tx);
        let _ = handle.join();
    }

    // ─────────────────────────────────────────────────────────────────
    // notify_config sanity
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn notify_config_can_be_constructed() {
        let _c: NotifyConfig = notify_config();
    }

    // ─────────────────────────────────────────────────────────────────
    // integration: Watcher::start (recommended backend)
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn watcher_start_observes_top_level_file_creation() {
        let dir = TempDir::new().unwrap();
        let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

        let target = dir.path().join("a.md");
        std::fs::write(&target, b"hello").unwrap();

        let ev = wait_for_event_at(&rx, &target, Duration::from_secs(5))
            .expect("should observe an event for the new file");
        assert!(
            event_paths(&ev).iter().any(|p| p == &target),
            "received event must reference the target path: {ev:?}"
        );

        drop(watcher);
    }

    #[test]
    fn watcher_start_observes_nested_file_creation() {
        let dir = TempDir::new().unwrap();
        // Pre-create the subdirectory so the recursive backend has it
        // registered before we start watching, avoiding the inotify race
        // where a newly-created descendant directory may not yet be watched
        // when its first child is written.
        let sub = dir.path().join("sub");
        std::fs::create_dir_all(&sub).unwrap();

        let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

        let target = sub.join("nested.md");
        std::fs::write(&target, b"nested").unwrap();

        let ev = wait_for_event_at(&rx, &target, Duration::from_secs(5))
            .expect("should observe an event for nested file");
        assert!(
            event_paths(&ev).iter().any(|p| p == &target),
            "received event must reference the nested path: {ev:?}"
        );

        drop(watcher);
    }

    // ─────────────────────────────────────────────────────────────────
    // integration: poll fallback
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn watcher_start_with_poll_observes_file_creation() {
        let dir = TempDir::new().unwrap();
        let (watcher, rx) =
            Watcher::start_with_poll(dir.path()).expect("poll start should succeed");

        let target = dir.path().join("polled.md");
        std::fs::write(&target, b"polled").unwrap();

        // PollWatcher with 2s interval; allow generous timeout.
        let ev = wait_for_event_at(&rx, &target, Duration::from_secs(8))
            .expect("poll backend should eventually observe the file");
        assert!(
            event_paths(&ev).iter().any(|p| p == &target),
            "poll event must reference target: {ev:?}"
        );

        drop(watcher);
    }

    // ─────────────────────────────────────────────────────────────────
    // integration: Drop synchronously stops new events
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn dropping_watcher_blocks_new_events() {
        let dir = TempDir::new().unwrap();
        let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

        // Generate some traffic so the adapter is alive and processing.
        let warmup = dir.path().join("warmup.md");
        std::fs::write(&warmup, b"warm").unwrap();
        let _ = wait_for_event_at(&rx, &warmup, Duration::from_secs(5));

        // Flush remaining events from the warmup phase.
        drain_events(&rx, Duration::from_millis(200));

        // Synchronously stop the watcher.
        drop(watcher);

        // After Drop, write a uniquely named file. It must not appear in any
        // event we drain from the receiver.
        let marker_name = format!("drop_marker_{}.md", std::process::id());
        let marker = dir.path().join(&marker_name);
        std::fs::write(&marker, b"after-drop").unwrap();

        let queued =
            drain_until_disconnected(&rx, Duration::from_millis(300), Duration::from_secs(10));

        let any_marker = queued
            .iter()
            .any(|ev| event_paths(ev).iter().any(|p| p == &marker));
        assert!(
            !any_marker,
            "no event referencing {marker_name} should appear after Drop; got {queued:?}"
        );
    }

    // ─────────────────────────────────────────────────────────────────
    // integration: error cases
    // ─────────────────────────────────────────────────────────────────

    #[test]
    fn watcher_start_returns_pathnotfound_for_missing_path() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("does_not_exist");
        match Watcher::start(&missing) {
            Ok(_) => panic!("expected start to fail for missing path"),
            Err(WatcherError::PathNotFound(p)) => assert_eq!(p, missing),
            Err(other) => panic!("expected PathNotFound, got {other:?}"),
        }
    }

    #[test]
    fn watcher_start_returns_pathnotfound_for_regular_file() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["solo.md"]);
        let file = dir.path().join("solo.md");
        match Watcher::start(&file) {
            Ok(_) => panic!("expected start to fail for regular file"),
            Err(WatcherError::PathNotFound(p)) => assert_eq!(p, file),
            Err(other) => panic!("expected PathNotFound, got {other:?}"),
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // optional: symlink directory as root is accepted
    // ─────────────────────────────────────────────────────────────────

    #[cfg(unix)]
    #[test]
    fn watcher_start_accepts_symlink_directory_root() {
        let dir = TempDir::new().unwrap();
        let real = dir.path().join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = dir.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let (watcher, _rx) =
            Watcher::start(&link).expect("symlink directory root should be accepted");
        drop(watcher);
    }
}
