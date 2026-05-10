//! Registry for write-originated paths that a future file watcher can ignore.
//!
//! Paths are stored exactly as provided. The registry does not canonicalize,
//! normalize, or otherwise resolve path representations.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum WriteIgnoreError {
    #[error("write_ignore registry lock poisoned")]
    LockPoisoned,
    #[error("failed to start write_ignore cleanup worker")]
    CleanupWorkerSpawnFailed,
}

#[derive(Debug, Default)]
pub struct WriteIgnoreRegistry {
    ignored_paths: Mutex<HashSet<PathBuf>>,
}

impl WriteIgnoreRegistry {
    /// Creates an empty write-ignore registry.
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a path and returns whether it was newly inserted.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn register(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;

        Ok(ignored_paths.insert(path.as_ref().to_path_buf()))
    }

    /// Returns whether the path is currently registered.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn should_ignore(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let ignored_paths = self.lock()?;

        Ok(ignored_paths.contains(path.as_ref()))
    }

    /// Atomically removes a path and returns whether it was present.
    ///
    /// This is kept as a compatibility alias for callers that consume ignored
    /// write events exactly once.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn consume(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        self.unregister(path)
    }

    /// Removes a path and returns whether it was present.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn unregister(&self, path: impl AsRef<Path>) -> Result<bool, WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;

        Ok(ignored_paths.remove(path.as_ref()))
    }

    /// Returns the number of registered paths.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn len(&self) -> Result<usize, WriteIgnoreError> {
        Ok(self.lock()?.len())
    }

    /// Returns whether there are no registered paths.
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn is_empty(&self) -> Result<bool, WriteIgnoreError> {
        Ok(self.len()? == 0)
    }

    /// 登録済みパスをすべて消去する。
    ///
    /// プロジェクトの再オープン等、ライフサイクル境界で呼ぶ。
    /// 内部 [`HashSet::clear`] のラッパであり、lock の poison のみ伝播する。
    /// 再度 `register` を行えば通常通り動作するため、registry の再利用が可能。
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn clear(&self) -> Result<(), WriteIgnoreError> {
        let mut ignored_paths = self.lock()?;
        ignored_paths.clear();
        Ok(())
    }

    /// Locks the registry and maps poisoned mutex errors into the module error type.
    ///
    /// @returns Registry mutex guard on success, or `WriteIgnoreError::LockPoisoned` when poisoned.
    fn lock(&self) -> Result<MutexGuard<'_, HashSet<PathBuf>>, WriteIgnoreError> {
        self.ignored_paths
            .lock()
            .map_err(|_| WriteIgnoreError::LockPoisoned)
    }
}

#[cfg(test)]
#[path = "write_ignore_tests.rs"]
mod write_ignore_tests;
