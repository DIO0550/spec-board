//! Registry for write-originated paths that a future file watcher can ignore.
//!
//! Paths are stored exactly as provided. The registry does not canonicalize,
//! normalize, or otherwise resolve path representations.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use thiserror::Error;

const DEFAULT_WRITE_IGNORE_TIMEOUT: Duration = Duration::from_secs(5);

type IgnoredPaths = HashMap<PathBuf, Instant>;
type SharedIgnoredPaths = Arc<Mutex<IgnoredPaths>>;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WriteIgnoreError {
    #[error("write_ignore registry lock poisoned")]
    LockPoisoned,
}

#[derive(Debug)]
pub struct WriteIgnoreRegistry {
    ignored_paths: SharedIgnoredPaths,
    timeout: Duration,
}

impl Default for WriteIgnoreRegistry {
    fn default() -> Self {
        Self {
            ignored_paths: Arc::new(Mutex::new(HashMap::new())),
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
            ignored_paths: Arc::new(Mutex::new(HashMap::new())),
            timeout,
        }
    }

    /// Registers a path and returns whether it was newly inserted.
    pub fn register(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let path = path.as_ref().to_path_buf();
        let registered_at = Instant::now();
        let inserted = {
            let mut ignored_paths = self.lock()?;
            if ignored_paths.contains_key(&path) {
                false
            } else {
                ignored_paths.insert(path.clone(), registered_at);
                true
            }
        };

        if inserted {
            self.spawn_timeout_cleanup(path, registered_at);
        }

        Ok(inserted)
    }

    /// Returns whether the path is currently registered.
    pub fn should_ignore(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let ignored_paths = self.lock()?;

        Ok(ignored_paths.contains_key(path.as_ref()))
    }

    /// Atomically removes a path and returns whether it was present.
    pub fn consume(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;

        Ok(ignored_paths.remove(path.as_ref()).is_some())
    }

    /// Removes a path and returns whether it was present.
    pub fn unregister(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;

        Ok(ignored_paths.remove(path.as_ref()).is_some())
    }

    /// Returns the number of registered paths.
    pub fn len(&self) -> Result<usize, WriteIgnoreError> {
        Ok(self.lock()?.len())
    }

    /// Returns whether there are no registered paths.
    pub fn is_empty(&self) -> Result<bool, WriteIgnoreError> {
        Ok(self.len()? == 0)
    }

    fn lock(&self) -> Result<MutexGuard<'_, IgnoredPaths>, WriteIgnoreError> {
        self.ignored_paths
            .lock()
            .map_err(|_| WriteIgnoreError::LockPoisoned)
    }

    fn spawn_timeout_cleanup(&self, path: PathBuf, registered_at: Instant) {
        let ignored_paths = Arc::clone(&self.ignored_paths);
        let timeout = self.timeout;

        std::thread::spawn(move || {
            std::thread::sleep(timeout);
            Self::remove_if_registration_matches(&ignored_paths, &path, registered_at);
        });
    }

    fn remove_if_registration_matches(
        ignored_paths: &SharedIgnoredPaths,
        path: &Path,
        registered_at: Instant,
    ) {
        let Ok(mut ignored_paths) = ignored_paths.lock() else {
            return;
        };

        if ignored_paths.get(path) == Some(&registered_at) {
            ignored_paths.remove(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        SharedIgnoredPaths, WriteIgnoreError, WriteIgnoreRegistry, DEFAULT_WRITE_IGNORE_TIMEOUT,
    };

    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::{Arc, Barrier, Mutex};
    use std::thread;
    use std::time::{Duration, Instant};

    const TEST_TIMEOUT: Duration = Duration::from_millis(80);
    const BEFORE_TIMEOUT: Duration = Duration::from_millis(30);
    const AFTER_TIMEOUT: Duration = Duration::from_millis(100);

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
    fn registered_path_is_removed_after_timeout() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        thread::sleep(AFTER_TIMEOUT);

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

        thread::sleep(TEST_TIMEOUT);

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
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
    fn timeout_cleanup_after_consume_is_noop() {
        let registry = WriteIgnoreRegistry::with_timeout(TEST_TIMEOUT);

        registry
            .register("tasks/example.md")
            .expect("registry should be writable");

        assert!(registry
            .consume("tasks/example.md")
            .expect("registry should be writable"));

        thread::sleep(AFTER_TIMEOUT);

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

        thread::sleep(Duration::from_millis(40));

        assert!(!registry
            .should_ignore("tasks/example.md")
            .expect("registry should be readable"));
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
    fn concurrent_consume_allows_only_one_success() {
        const THREAD_COUNT: usize = 8;

        let registry = Arc::new(WriteIgnoreRegistry::new());
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

    #[test]
    fn timeout_cleanup_noops_when_lock_is_poisoned() {
        let ignored_paths: SharedIgnoredPaths = Arc::new(Mutex::new(HashMap::new()));
        let poisoned_paths = Arc::clone(&ignored_paths);
        let registered_at = Instant::now();

        ignored_paths
            .lock()
            .expect("registry should be lockable before insert")
            .insert(PathBuf::from("tasks/example.md"), registered_at);

        let handle = thread::spawn(move || {
            let _guard = poisoned_paths
                .lock()
                .expect("registry should be lockable before poison");

            panic!("poison write_ignore registry lock");
        });

        assert!(handle.join().is_err());

        WriteIgnoreRegistry::remove_if_registration_matches(
            &ignored_paths,
            PathBuf::from("tasks/example.md").as_path(),
            registered_at,
        );
    }

    #[test]
    fn default_timeout_is_five_seconds() {
        assert_eq!(Duration::from_secs(5), DEFAULT_WRITE_IGNORE_TIMEOUT);
    }
}
