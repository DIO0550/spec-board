//! watcher の prepare / spawn を effect 層へ注入するための port abstraction。
//!
//! 本番実装 `TauriWatcherFactory` は `tauri::AppHandle` を保持し、
//! `crate::watcher_event::spawn_adapter` 経由で Tauri IPC emit を行う。
//! テストでは `NoopWatcherFactory` 等の手書きフェイクを差し込む。
//!
//! port 化の意図:
//! - effect 層 (`open_project_impl`) からは `tauri::AppHandle` を完全に隠蔽し、
//!   thin layer 側でのみ `AppHandle` を保持する契約を保つ
//! - prepare / spawn の 2 closure を `WatcherFactory` trait 1 つに集約することで、
//!   effect 層シグネチャの引数数とジェネリック数を削減する

use std::path::Path;
use std::sync::Arc;

use crate::config::Config;
use crate::project::open::OpenProjectError;
use crate::state::{AppState, BoxedWatcherHandle};

/// watcher 準備 / 起動の port。
///
/// `prepare` は GUIDE.md 書き込みより前に呼ばれ、失敗時は effect 層が
/// 副作用ゼロで `Err` 復帰する契約。`spawn` は AppState commit 完了後に
/// 呼ばれ、adapter スレッドを起動して `BoxedWatcherHandle` を返す。
pub trait WatcherFactory {
    /// `prepare` の結果型。本番では `(Watcher, Receiver<FsEvent>)` 相当、
    /// テストでは `()` 等の軽量な値で代替する。
    type Prepared;

    fn prepare(&self, root: &Path) -> Result<Self::Prepared, OpenProjectError>;

    fn spawn(
        &self,
        prepared: Self::Prepared,
        state: &Arc<AppState>,
        root: &Path,
        config: &Config,
    ) -> BoxedWatcherHandle;
}

/// 本番実装。`AppHandle` を保持し、`watcher_event::prepare_watcher` /
/// `spawn_adapter` に委譲する。
///
/// `AppHandle` は本構造体のフィールドに閉じ込め、effect 層
/// (`open_project_impl`) には漏出させない。
pub struct TauriWatcherFactory {
    pub app: tauri::AppHandle,
}

impl WatcherFactory for TauriWatcherFactory {
    type Prepared = (
        spec_board_fs::watcher::core::Watcher,
        std::sync::mpsc::Receiver<spec_board_fs::watcher::core::FsEvent>,
    );

    fn prepare(&self, root: &Path) -> Result<Self::Prepared, OpenProjectError> {
        crate::watcher_event::prepare_watcher(root)
            .map_err(|source| OpenProjectError::WatcherInitFailed { source })
    }

    fn spawn(
        &self,
        prepared: Self::Prepared,
        state: &Arc<AppState>,
        root: &Path,
        config: &Config,
    ) -> BoxedWatcherHandle {
        let (watcher, rx) = prepared;
        let handle = crate::watcher_event::spawn_adapter(
            &self.app,
            root,
            config,
            Arc::clone(state),
            watcher,
            rx,
        );
        Box::new(handle) as BoxedWatcherHandle
    }
}

/// テスト共有の no-op 実装。`prepare` は常に `Ok(())`、`spawn` は
/// `NoopWatcherHandle` を返す。`open_tests.rs` / `task/get_tests.rs` /
/// `task/create/command_tests.rs` から共用する。
#[cfg(test)]
pub(crate) struct NoopWatcherFactory;

#[cfg(test)]
impl WatcherFactory for NoopWatcherFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn spawn(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        _root: &Path,
        _config: &Config,
    ) -> BoxedWatcherHandle {
        Box::new(spec_board_fs::watcher::handle::NoopWatcherHandle::new()) as BoxedWatcherHandle
    }
}
