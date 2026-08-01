//! watcher の prepare / paused stage を effect 層へ注入する port abstraction。
//!
//! 本番実装 `TauriWatcherFactory` は `tauri::AppHandle` を保持し、
//! `crate::watcher_event::stage_adapter` 経由で Tauri IPC emit を行う。
//! stage 済み worker は open swap が activation latch を解放するまで event を
//! 処理しない。テストでは `NoopWatcherFactory` 等の手書き fake を差し込む。

use std::path::Path;
use std::sync::Arc;
#[cfg(test)]
use std::thread::{self, JoinHandle};

#[cfg(test)]
use spec_board_fs::watcher::handle::WatcherHandle;
#[cfg(test)]
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

use crate::config::column_name::ColumnName;
use crate::project::open::OpenProjectError;
use crate::project_session::SessionIdentity;
use crate::state::active_project_resources::StagedProjectResources;
#[cfg(test)]
use crate::state::active_project_resources::{
    pending_activation_state, wait_for_activation, WatcherActivation,
};
use crate::state::AppState;
#[cfg(test)]
use crate::state::BoxedWatcherHandle;

/// watcher 準備 / paused stage の crate 内 port。
///
/// `prepare` は GUIDE.md 書き込みより前に backend/channel を確保する。`stage_paused`
/// は adapter thread と handle をすべて構築するが、worker は activation latch が
/// `Active` になるまで event loop へ進まない。どちらかが失敗した場合、resident
/// project session/resources は変更されない。
pub(crate) trait WatcherFactory {
    /// `prepare` の結果型。本番では `(Watcher, Receiver<FsEvent>)` 相当、
    /// テストでは `()` 等の軽量な値で代替する。
    type Prepared;

    fn prepare(&self, root: &Path) -> Result<Self::Prepared, OpenProjectError>;

    fn stage_paused(
        &self,
        prepared: Self::Prepared,
        state: &Arc<AppState>,
        identity: SessionIdentity,
        default_status: ColumnName,
    ) -> Result<StagedProjectResources, OpenProjectError>;
}

/// 本番実装。`AppHandle` を保持し、`watcher_event::prepare_watcher` /
/// `stage_adapter` に委譲する。
///
/// `AppHandle` は本構造体のフィールドに閉じ込め、effect 層
/// (`open_project_impl`) には漏出させない。フィールド自体も非公開とし、
/// 外部からの取り出しを `new` 経由のみに制限する。
pub(crate) struct TauriWatcherFactory {
    app: tauri::AppHandle,
}

impl TauriWatcherFactory {
    pub(crate) fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
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

    fn stage_paused(
        &self,
        prepared: Self::Prepared,
        state: &Arc<AppState>,
        identity: SessionIdentity,
        default_status: ColumnName,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let (watcher, rx) = prepared;
        crate::watcher_event::stage_adapter(
            &self.app,
            default_status,
            Arc::clone(state),
            identity,
            watcher,
            rx,
        )
        .map_err(|source| OpenProjectError::WatcherInitFailed { source })
    }
}

/// paused worker を所有し、`stop` で必ず join する test 用 handle。
#[cfg(test)]
struct NoopPausedWatcherHandle {
    join: Option<JoinHandle<()>>,
}

#[cfg(test)]
impl WatcherHandle for NoopPausedWatcherHandle {
    fn stop(&mut self) {
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

/// テスト共有の no-op 実装。実 watcher と同じく worker を Pending で spawn し、
/// stage abandon 時は Cancelled、swap 成功時は Active を観測して終了する。
#[cfg(test)]
pub(crate) struct NoopWatcherFactory;

#[cfg(test)]
impl WatcherFactory for NoopWatcherFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
        _default_status: ColumnName,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let activation_state = pending_activation_state();
        let worker_state = Arc::clone(&activation_state);
        let join = thread::Builder::new()
            .name("spec-board-noop-watcher".to_owned())
            .spawn(move || {
                let _ = wait_for_activation(worker_state.as_ref());
            })
            .map_err(spec_board_fs::watcher::core::WatcherError::Io)
            .map_err(|source| OpenProjectError::WatcherInitFailed { source })?;
        let activation = WatcherActivation::new(activation_state, join.thread().clone());
        let handle = Box::new(NoopPausedWatcherHandle { join: Some(join) }) as BoxedWatcherHandle;

        Ok(StagedProjectResources::new(
            identity,
            handle,
            activation,
            Arc::new(WriteIgnoreRegistry::new()),
        ))
    }
}
