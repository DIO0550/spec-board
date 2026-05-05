//! Registry for write-originated paths that a future file watcher can ignore.
//!
//! Paths are stored exactly as provided. The registry does not canonicalize,
//! normalize, or otherwise resolve path representations.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use thiserror::Error;

const DEFAULT_WRITE_IGNORE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WriteIgnoreError {
    #[error("write_ignore registry lock poisoned")]
    LockPoisoned,
    #[error("failed to start write_ignore cleanup worker")]
    CleanupWorkerSpawnFailed,
}

#[derive(Debug)]
pub struct WriteIgnoreRegistry {
    ignored_paths: Mutex<HashMap<PathBuf, Instant>>,
    timeout: Duration,
}

impl Default for WriteIgnoreRegistry {
    fn default() -> Self {
        Self {
            ignored_paths: Mutex::new(HashMap::new()),
            timeout: DEFAULT_WRITE_IGNORE_TIMEOUT,
        }
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
            ignored_paths: Mutex::new(HashMap::new()),
            timeout,
        }
    }

    /// Registers a path and returns whether it was newly inserted.
    pub fn register(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;
        Self::remove_expired_paths(&mut ignored_paths);
        let path = path.as_ref().to_path_buf();

        if ignored_paths.contains_key(&path) {
            return Ok(false);
        }

        ignored_paths.insert(path, Instant::now() + self.timeout);

        Ok(true)
    }

    /// Returns whether the path is currently registered.
    pub fn should_ignore(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;
        Self::remove_expired_paths(&mut ignored_paths);

        Ok(ignored_paths.contains_key(path.as_ref()))
    }

    /// Atomically removes a path and returns whether it was present.
    ///
    /// This is kept as a compatibility alias for callers that consume ignored
    /// write events exactly once.
    pub fn consume(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        self.unregister(path)
    }

    /// Removes a path and returns whether it was present.
    pub fn unregister(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;
        Self::remove_expired_paths(&mut ignored_paths);

        Ok(ignored_paths.remove(path.as_ref()).is_some())
    }

    /// Returns the number of registered paths.
    pub fn len(&self) -> Result<usize, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;
        Self::remove_expired_paths(&mut ignored_paths);

        Ok(ignored_paths.len())
    }

    /// Returns whether there are no registered paths.
    pub fn is_empty(&self) -> Result<bool, WriteIgnoreError> {
        Ok(self.len()? == 0)
    }

    fn lock(&self) -> Result<MutexGuard<'_, HashMap<PathBuf, Instant>>, WriteIgnoreError> {
        self.ignored_paths
            .lock()
            .map_err(|_| WriteIgnoreError::LockPoisoned)
    }

    fn remove_expired_paths(ignored_paths: &mut HashMap<PathBuf, Instant>) {
        let now = Instant::now();
        ignored_paths.retain(|_, expires_at| *expires_at > now);
    }
}

#[cfg(test)]
mod tests {
    use super::{WriteIgnoreError, WriteIgnoreRegistry};

    use std::path::PathBuf;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::Duration;

    const TEST_TIMEOUT: Duration = Duration::from_millis(50);
    const WAIT_AFTER_TIMEOUT: Duration = Duration::from_millis(75);

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
        let registry = WriteIgnoreRegistry::new();

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
    fn duplicate_register_returns_false_and_keeps_len() {
        let registry = WriteIgnoreRegistry::new();

        assert!(registry
            .register("tasks/example.md")
            .expect("registry should be writable"));
        assert!(!registry
            .register("tasks/example.md")
            .expect("registry should be writable"));
        assert_eq!(1, registry.len().expect("registry should be readable"));
    }

    #[test]
    fn registered_path_expires_when_event_never_arrives() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        thread::sleep(WAIT_AFTER_TIMEOUT);

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
        assert!(registry.is_empty().expect("registry should be readable"));
        assert!(registry
            .register("tasks/example.md")
            .expect("expired path should be registerable again"));
    }

    #[test]
    fn unregistered_path_is_not_ignored_after_unregister() {
        let registry = WriteIgnoreRegistry::new();

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
        let registry = WriteIgnoreRegistry::new();

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
    fn different_path_representations_are_different_keys() {
        let registry = WriteIgnoreRegistry::new();

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

        let registry = Arc::new(WriteIgnoreRegistry::new());
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
    fn returns_error_when_lock_is_poisoned() {
        let registry = Arc::new(WriteIgnoreRegistry::new());
        let poisoned_registry = Arc::clone(&registry);

        let handle = thread::spawn(move || {
            let _guard = poisoned_registry
                .ignored_paths
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
}
