//! ProjectSession writer command向けの共通テスト補助。

use std::io;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::project_session::SessionRevision;
use crate::state::AppState;
use crate::task::io::{TaskIo, TaskIoError};

/// 現在のcoherent session revisionを返す。
pub(crate) fn session_revision(state: &AppState) -> SessionRevision {
    state
        .require_session_snapshot()
        .expect("project session snapshot")
        .version()
        .revision
}

/// 現在のsession専用write-ignore registryの要素数を返す。
pub(crate) fn session_write_ignore_len(state: &AppState) -> usize {
    let snapshot = state
        .require_session_snapshot()
        .expect("project session snapshot");
    state
        .resources_for(snapshot.version())
        .expect("matching project session resources")
        .write_ignore()
        .len()
        .expect("write-ignore registry lock")
}

/// revision枯渇時にTaskIoへ一切到達しないことを検証するspy。
#[derive(Default)]
pub(crate) struct CountingTaskIo {
    calls: AtomicUsize,
}

impl CountingTaskIo {
    pub(crate) fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }

    fn reject_call(&self) -> TaskIoError {
        self.calls.fetch_add(1, Ordering::SeqCst);
        TaskIoError::Io(io::Error::other(
            "TaskIo must not be called after revision preflight failure",
        ))
    }
}

impl TaskIo for CountingTaskIo {
    fn ensure_dir(&self, _dir: &Path) -> Result<(), TaskIoError> {
        Err(self.reject_call())
    }

    fn write_new(&self, _path: &Path, _bytes: &[u8]) -> Result<(), TaskIoError> {
        Err(self.reject_call())
    }

    fn write_existing(&self, _path: &Path, _bytes: &[u8]) -> Result<(), TaskIoError> {
        Err(self.reject_call())
    }

    fn remove(&self, _path: &Path) -> Result<(), TaskIoError> {
        Err(self.reject_call())
    }

    fn read(&self, _path: &Path) -> Result<Vec<u8>, TaskIoError> {
        Err(self.reject_call())
    }

    fn try_exists(&self, _path: &Path) -> Result<bool, TaskIoError> {
        Err(self.reject_call())
    }
}
