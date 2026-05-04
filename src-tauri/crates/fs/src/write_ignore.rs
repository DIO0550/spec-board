//! Registry for write-originated paths that a future file watcher can ignore.
//!
//! Paths are stored exactly as provided. The registry does not canonicalize,
//! normalize, or otherwise resolve path representations.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use thiserror::Error;

const DEFAULT_WRITE_IGNORE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct IgnoredPathEntry {
    registration_id: u128,
    expires_at: Instant,
}

#[derive(Debug, Default)]
struct RegistryState {
    ignored_paths: HashMap<PathBuf, IgnoredPathEntry>,
    next_registration_id: u128,
    cleanup_worker_started: bool,
    shutdown_requested: bool,
}

type SharedRegistryState = Arc<(Mutex<RegistryState>, Condvar)>;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WriteIgnoreError {
    #[error("write_ignore registry lock poisoned")]
    LockPoisoned,
    #[error("failed to start write_ignore cleanup worker")]
    CleanupWorkerSpawnFailed,
}

#[derive(Debug)]
pub struct WriteIgnoreRegistry {
    state: SharedRegistryState,
    timeout: Duration,
}

impl Default for WriteIgnoreRegistry {
    fn default() -> Self {
        Self {
            state: Arc::new((Mutex::new(RegistryState::default()), Condvar::new())),
            timeout: DEFAULT_WRITE_IGNORE_TIMEOUT,
        }
    }
}

impl Drop for WriteIgnoreRegistry {
    fn drop(&mut self) {
        let Ok(mut state) = self.state.0.lock() else {
            return;
        };

        state.shutdown_requested = true;
        self.state.1.notify_one();
    }
}

impl WriteIgnoreRegistry {
    /// Creates an empty write-ignore registry.
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn with_timeout(timeout: Duration) -> Self {
        Self {
            state: Arc::new((Mutex::new(RegistryState::default()), Condvar::new())),
            timeout,
        }
    }

    /// Registers a path and returns whether it was newly inserted.
    pub fn register(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let path = path.as_ref().to_path_buf();
        self.ensure_cleanup_worker_started()?;

        let inserted = {
            let mut state = self.lock()?;
            if state.ignored_paths.contains_key(&path) {
                false
            } else {
                let entry = IgnoredPathEntry {
                    registration_id: state.next_registration_id,
                    expires_at: Instant::now() + self.timeout,
                };
                state.next_registration_id += 1;
                state.ignored_paths.insert(path, entry);
                true
            }
        };

        if inserted {
            self.state.1.notify_one();
        }

        Ok(inserted)
    }

    /// Returns whether the path is currently registered.
    pub fn should_ignore(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let state = self.lock()?;

        Ok(state.ignored_paths.contains_key(path.as_ref()))
    }

    /// Atomically removes a path and returns whether it was present.
    pub fn consume(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut state = self.lock()?;

        Ok(state.ignored_paths.remove(path.as_ref()).is_some())
    }

    /// Removes a path and returns whether it was present.
    pub fn unregister(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut state = self.lock()?;

        Ok(state.ignored_paths.remove(path.as_ref()).is_some())
    }

    /// Returns the number of registered paths.
    pub fn len(&self) -> Result<usize, WriteIgnoreError> {
        Ok(self.lock()?.ignored_paths.len())
    }

    /// Returns whether there are no registered paths.
    pub fn is_empty(&self) -> Result<bool, WriteIgnoreError> {
        Ok(self.len()? == 0)
    }

    fn lock(&self) -> Result<MutexGuard<'_, RegistryState>, WriteIgnoreError> {
        self.state
            .0
            .lock()
            .map_err(|_| WriteIgnoreError::LockPoisoned)
    }

    fn ensure_cleanup_worker_started(&self) -> Result<(), WriteIgnoreError> {
        {
            let mut state = self.lock()?;
            if state.cleanup_worker_started {
                return Ok(());
            }

            state.cleanup_worker_started = true;
        }

        let state = Arc::clone(&self.state);
        let spawn_result = std::thread::Builder::new()
            .name("write-ignore-cleanup".to_string())
            .spawn(move || Self::run_cleanup_worker(state));

        if spawn_result.is_ok() {
            return Ok(());
        }

        if let Ok(mut state) = self.lock() {
            state.cleanup_worker_started = false;
        }

        Err(WriteIgnoreError::CleanupWorkerSpawnFailed)
    }

    fn run_cleanup_worker(state: SharedRegistryState) {
        let (state_mutex, wake_signal) = &*state;
        let Ok(mut state) = state_mutex.lock() else {
            return;
        };

        loop {
            if state.shutdown_requested {
                return;
            }

            let Some(next_expires_at) = Self::next_expires_at(&state.ignored_paths) else {
                let Ok(next_state) = wake_signal.wait(state) else {
                    return;
                };
                state = next_state;
                continue;
            };

            let now = Instant::now();
            if now >= next_expires_at {
                state
                    .ignored_paths
                    .retain(|_, entry| entry.expires_at > now);
                continue;
            }

            let wait_duration = next_expires_at.saturating_duration_since(now);
            let Ok((next_state, _)) = wake_signal.wait_timeout(state, wait_duration) else {
                return;
            };
            state = next_state;
        }
    }

    fn next_expires_at(ignored_paths: &HashMap<PathBuf, IgnoredPathEntry>) -> Option<Instant> {
        ignored_paths
            .values()
            .min_by_key(|entry| (entry.expires_at, entry.registration_id))
            .map(|entry| entry.expires_at)
    }
}

#[cfg(test)]
mod tests {
    use super::{WriteIgnoreError, WriteIgnoreRegistry, DEFAULT_WRITE_IGNORE_TIMEOUT};

    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, Instant};

    const TEST_TIMEOUT: Duration = Duration::from_millis(80);
    const BEFORE_TIMEOUT: Duration = Duration::from_millis(30);
    const WAIT_STEP: Duration = Duration::from_millis(10);
    const WAIT_TIMEOUT: Duration = Duration::from_secs(1);

    #[test]
    fn new_registry_is_empty_and_unregistered_path_is_not_ignored() {
        let registry = WriteIgnoreRegistry::new();

        assert!(registry.is_empty().expect("registry should be readable"));
        assert_eq!(0, registry.len().expect("registry should be readable"));
        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
    }

    #[test]
    fn registered_path_is_ignored() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        assert!(registry
            .register("tasks/example.md")
            .expect("registry should be writable"));
        assert!(registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert_eq!(1, registry.len().expect("registry should be readable"));
        assert!(!registry.is_empty().expect("registry should be readable"));
    }

    #[test]
    fn registered_path_is_removed_after_timeout() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        wait_until(WAIT_TIMEOUT, || {
            !registry
                .should_ignore("tasks/example.md")
                .expect("registry should be readable")
        });

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert_eq!(0, registry.len().expect("registry should be readable"));
    }

    #[test]
    fn duplicate_register_returns_false_and_keeps_len() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        assert!(registry
            .register("tasks/example.md")
            .expect("registry should be writable"));
        thread::sleep(BEFORE_TIMEOUT);
        assert!(!registry
            .register("tasks/example.md")
            .expect("registry should be writable"));
        assert_eq!(1, registry.len().expect("registry should be readable"));

        wait_until(WAIT_TIMEOUT, || {
            !registry
                .should_ignore("tasks/example.md")
                .expect("registry should be readable")
        });

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
    }

    #[test]
    fn unregistered_path_is_not_ignored_after_unregister() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        assert!(registry
            .unregister("tasks/example.md")
            .expect("registry should be writable"));
        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert!(registry.is_empty().expect("registry should be readable"));
    }

    #[test]
    fn unregister_missing_path_returns_false() {
        let registry = WriteIgnoreRegistry::new();

        assert!(!registry
            .unregister("tasks/missing.md")
            .expect("registry should be writable"));
    }

    #[test]
    fn consume_returns_true_once_and_removes_path() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        assert!(registry
            .consume("tasks/example.md")
            .expect("registry should be writable"));
        assert!(!registry
            .consume("tasks/example.md")
            .expect("registry should be writable"));
        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert!(registry.is_empty().expect("registry should be readable"));
    }

    #[test]
    fn timeout_cleanup_after_consume_is_noop() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        assert!(registry
            .consume("tasks/example.md")
            .expect("registry should be writable"));

        wait_until(WAIT_TIMEOUT, || {
            registry.is_empty().expect("registry should be readable")
        });

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert!(registry.is_empty().expect("registry should be readable"));
    }

    #[test]
    fn timeout_cleanup_does_not_remove_re_registered_path() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");
        thread::sleep(BEFORE_TIMEOUT);
        registry
            .consume("tasks/example.md")
            .expect("registry should be writable");
        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        thread::sleep(Duration::from_millis(60));

        assert!(registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));

        wait_until(WAIT_TIMEOUT, || {
            !registry
                .should_ignore("tasks/example.md")
                .expect("registry should be readable")
        });

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
    }

    #[test]
    fn different_path_representations_are_different_keys() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        assert!(registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert!(!registry
            .should_ignore("./tasks/example.md")
            .expect("registry should be readable"));
        assert!(registry
            .register("./tasks/example.md")
            .expect("registry should be writable"));
        assert_eq!(2, registry.len().expect("registry should be readable"));
    }

    #[test]
    fn concurrent_access_is_synchronized() {
        const THREAD_COUNT: usize = 8;

        let registry = Arc::new(WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT));
        let barrier = Arc::new(Barrier::new(THREAD_COUNT));
        let handles = (0..THREAD_COUNT)
            .map(|index| {
                let registry = Arc::clone(&registry);
                let barrier = Arc::clone(&barrier);

                thread::spawn(move || {
                    let path = PathBuf::from(format!("tasks/{index}.md"));

                    barrier.wait();

                    assert!(registry.register(&path).expect("register should work"));
                    assert!(registry
                        .should_ignore(&path)
                        .expect("should_ignore should work"));

                    if index % 2 == 0 {
                        assert!(registry.unregister(&path).expect("unregister should work"));
                    }
                })
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle.join().expect("thread should not panic");
        }

        assert_eq!(
            THREAD_COUNT / 2,
            registry.len().expect("registry should be readable")
        );

        for index in 0..THREAD_COUNT {
            let path = PathBuf::from(format!("tasks/{index}.md"));
            let should_ignore = registry
                .should_ignore(path)
                .expect("registry should be readable");

            assert_eq!(index % 2 == 1, should_ignore);
        }
    }

    #[test]
    fn concurrent_consume_allows_only_one_success() {
        const THREAD_COUNT: usize = 8;

        let registry = Arc::new(WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT));
        let barrier = Arc::new(Barrier::new(THREAD_COUNT));

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        let handles = (0..THREAD_COUNT)
            .map(|_| {
                let registry = Arc::clone(&registry);
                let barrier = Arc::clone(&barrier);

                thread::spawn(move || {
                    barrier.wait();

                    registry
                        .consume("tasks/example.md")
                        .expect("consume should work")
                })
            })
            .collect::<Vec<_>>();

        let success_count = handles
            .into_iter()
            .map(|handle| handle.join().expect("thread should not panic"))
            .filter(|consumed| *consumed)
            .count();

        assert_eq!(1, success_count);
        assert!(registry.is_empty().expect("registry should be readable"));
    }

    #[test]
    fn returns_error_when_lock_is_poisoned() {
        let registry = Arc::new(WriteIgnoreRegistry::new());
        let poisoned_registry = Arc::clone(&registry);

        let handle = thread::spawn(move || {
            let _guard = poisoned_registry
                .state
                .0
                .lock()
                .expect("registry should be lockable before poison");

            panic!("poison write_ignore registry lock");
        });

        assert!(handle.join().is_err());
        assert_eq!(
            WriteIgnoreError::LockPoisoned,
            registry
                .should_ignore("tasks/example.md")
                .expect_err("poisoned lock should be reported")
        );
    }

    #[test]
    fn timeout_cleanup_worker_exits_when_lock_is_poisoned() {
        let registry = Arc::new(WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT));
        let poisoned_registry = Arc::clone(&registry);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        let handle = thread::spawn(move || {
            let _guard = poisoned_registry
                .state
                .0
                .lock()
                .expect("registry should be lockable before poison");

            panic!("poison write_ignore registry lock");
        });

        assert!(handle.join().is_err());
        registry.state.1.notify_one();
        thread::sleep(TEST_TIMEOUT);
    }

    #[test]
    fn timeout_cleanup_worker_exits_when_shutdown_is_requested() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);
        let state = Arc::clone(&registry.state);
        let (sender, receiver) = std::sync::mpsc::channel();

        let handle = thread::spawn(move || {
            WriteIgnoreRegistry::run_cleanup_worker(state);
            sender
                .send(())
                .expect("test receiver should wait for worker exit");
        });

        {
            let mut state = registry.lock().expect("registry should be readable");
            state.shutdown_requested = true;
        }
        registry.state.1.notify_one();

        receiver
            .recv_timeout(WAIT_TIMEOUT)
            .expect("cleanup worker should exit on shutdown");
        handle.join().expect("worker should not panic");
    }

    #[test]
    fn default_timeout_is_five_seconds() {
        assert_eq!(Duration::from_secs(5), DEFAULT_WRITE_IGNORE_TIMEOUT);
    }

    #[test]
    fn registrations_use_unique_ids_even_when_instants_match() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");
        let first_entry = registry
            .lock()
            .expect("registry should be readable")
            .ignored_paths
            .get(Path::new("tasks/example.md"))
            .copied()
            .expect("registered path should exist");

        registry
            .consume("tasks/example.md")
            .expect("registry should be writable");
        registry
            .register("tasks/example.md")
            .expect("registry should be writable");
        let second_entry = registry
            .lock()
            .expect("registry should be readable")
            .ignored_paths
            .get(Path::new("tasks/example.md"))
            .copied()
            .expect("registered path should exist");

        assert_ne!(first_entry.registration_id, second_entry.registration_id);
    }

    fn wait_until(timeout: Duration, mut predicate: impl FnMut() -> bool) {
        let deadline = Instant::now() + timeout;

        while Instant::now() < deadline {
            if predicate() {
                return;
            }

            thread::sleep(WAIT_STEP);
        }

        assert!(predicate());
    }
}
