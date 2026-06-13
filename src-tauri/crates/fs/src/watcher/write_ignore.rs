//! Registry of write-originated paths that the file watcher should ignore.
//!
//! 自前の書き込みで生じた path を一時的に登録しておき、watcher 由来の
//! イベントを処理する側がその path を取り除いて（既登録なら自己書き込みと
//! 判定して）二重処理を抑止するために使う。
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

    /// Registers multiple paths atomically under a single lock.
    ///
    /// 空スライスは何もせず即座に `Ok(())` を返す。重複は HashSet によって自然に
    /// 1 件に丸まる。register と同じく path の正規化は行わない。
    ///
    /// # Errors
    ///
    /// - 内部の Mutex が poison 状態になっている場合 → [`WriteIgnoreError::LockPoisoned`]
    pub fn register_bulk(&self, paths: &[PathBuf]) -> Result<(), WriteIgnoreError> {
        if paths.is_empty() {
            return Ok(());
        }

        let mut ignored_paths = self.lock()?;
        for path in paths {
            ignored_paths.insert(path.clone());
        }
        Ok(())
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
    /// 自己書き込みイベントを 1 度だけ消費する用途（既登録なら `true` を返して
    /// 取り除く）と、登録のロールバック用途の両方で使う単一の取り除き API。
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

    /// Test 用に内部 Mutex を poison させる。
    ///
    /// 呼び出し側の preflight / register 経路で `WriteIgnoreError::LockPoisoned`
    /// が返り、それを呼び出し側のエラー型へ変換する挙動を effect 層レベルで
    /// 再現するために公開する。
    /// `cfg(test)` 内または `test-utils` feature 有効時のみコンパイルされ、本番 build では存在しない。
    #[cfg(any(test, feature = "test-utils"))]
    pub fn poison_lock_for_testing(&self) {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            std::thread::scope(|s| {
                s.spawn(|| {
                    let _guard = self.ignored_paths.lock().expect("lock before poison");
                    panic!("poison write_ignore lock for testing");
                });
            });
        }));
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
