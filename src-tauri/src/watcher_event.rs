//! `spec_board_fs::watcher::core::Watcher` の `FsEvent` を読み込み、`AppState`
//! の `tasks_cache` を差分更新したうえで `task-created` / `task-updated`
//! / `task-deleted` を `tauri::AppHandle::emit` で配信する adapter 層。
//!
//! # モジュール構成
//!
//! - `prepare_watcher(root)`: `Watcher::start` を呼んで `(Watcher, Receiver)`
//!   を確保するだけ。`open_project_impl` の AppState commit より前に
//!   実行される 1 段目。
//! - `spawn_adapter(app, root, config, state, watcher, rx)`: 既に確保済みの
//!   watcher / rx から adapter スレッドを spawn し、`EmittingWatcherHandle` を
//!   返す 2 段目。spawn は panic 以外で失敗しない。
//! - `handler::handle_event`: 1 件の `FsEvent` を処理する純粋関数。テストは
//!   ここに対して書く。
//! - `handler::run_event_loop`: adapter スレッド本体。`Receiver::recv` を
//!   blocking で消費し、`Disconnected` で抜ける。
//!
//! # スレッド寿命
//!
//! `EmittingWatcherHandle::stop()` は内部で
//! 1. `Watcher` を `drop` して `notify` バックエンドの送信側を切断する
//! 2. adapter スレッドを `join` する
//!
//! の 2 段で同期的に停止する。`stop()` は冪等で `AppState` の lock を
//! 一切取得しない（`watcher_handle` 取得中の deadlock を防ぐ）。

pub(crate) mod handler;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use tauri::{AppHandle, Emitter};

use crate::config::column_name::ColumnName;
use crate::config::Config;
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::default_status_for;
use spec_board_fs::watcher::core::{FsEvent, Watcher, WatcherError};
use spec_board_fs::watcher::handle::WatcherHandle;

/// emit の抽象化（本番 = `AppHandle::emit`、テスト = Vec push）。
pub(crate) type EmitFn = Box<dyn Fn(&str, serde_json::Value) + Send + Sync + 'static>;

/// adapter スレッドが共有する不変コンテキスト。
pub(crate) struct AdapterContext {
    pub(crate) root: PathBuf,
    pub(crate) default_status: ColumnName,
    pub(crate) state: Arc<AppState>,
    pub(crate) emit: EmitFn,
    /// MD ファイル I/O ポート。`handle_upsert` の `fs::read` を本 port 経由に
    /// 置換することで、effect 層から `std::fs::*` の直接呼び出しを排除する。
    pub(crate) io: Arc<dyn TaskIo>,
}

/// 実 `WatcherHandle` 実装。Watcher Drop + adapter join を内包する。
///
/// `watcher` が `Some` のうちは notify バックエンドの送信側が生きている。
/// `stop()` で `watcher` を drop して送信側を切断したのち adapter スレッドを
/// join することで、同期的に停止が完了する。
pub struct EmittingWatcherHandle {
    watcher: Option<Watcher>,
    join: Option<JoinHandle<()>>,
}

impl WatcherHandle for EmittingWatcherHandle {
    fn stop(&mut self) {
        // (1) Watcher を drop → Receiver<FsEvent> Disconnected
        // (2) adapter スレッド join（recv() ループが Err で抜ける）
        // 注: stop() は冪等。AppState lock を一切取らない（deadlock 回避）。
        if let Some(w) = self.watcher.take() {
            drop(w);
        }
        if let Some(handle) = self.join.take() {
            // panic は握り潰す（mutex poison を起こさない）。adapter 本体は
            // 既に catch_unwind で包んでいるので通常は panic で抜けない。
            let _ = handle.join();
        }
    }
}

/// `open_project_impl` の **AppState commit より前に**呼び出される 1 段目。
///
/// `Watcher::start` を試みて Watcher と Receiver を確保するだけで、adapter は
/// まだ spawn しない。失敗時はこの段階で `WatcherError` を返し、呼び出し側は
/// AppState を一切変更せずに `WatcherInitFailed` として伝播できる。
pub(crate) fn prepare_watcher(root: &Path) -> Result<(Watcher, Receiver<FsEvent>), WatcherError> {
    Watcher::start(root)
}

/// `open_project_impl` の **AppState commit 完了後**に呼び出される 2 段目。
///
/// 確保済みの `(watcher, rx)` から adapter スレッドを spawn し、実
/// `EmittingWatcherHandle` を組み立てる。spawn は panic 以外で失敗しないため
/// 戻り値は `EmittingWatcherHandle` 直接。
pub(crate) fn spawn_adapter(
    app: &AppHandle,
    root: &Path,
    config: &Config,
    state: Arc<AppState>,
    watcher: Watcher,
    rx: Receiver<FsEvent>,
) -> EmittingWatcherHandle {
    let app_for_emit = app.clone();
    let emit: EmitFn = Box::new(move |event, payload| {
        if let Err(err) = app_for_emit.emit(event, payload) {
            log::warn!("failed to emit `{event}`: {err}");
        }
    });
    let ctx = AdapterContext {
        root: root.to_path_buf(),
        default_status: default_status_for(config),
        state,
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
    };
    spawn_adapter_with_ctx(watcher, rx, ctx)
}

/// 既に組み立て済みの `AdapterContext` から adapter スレッドを spawn する。
/// テストでは emit を Vec push スタブにした context を渡すために直接呼ぶ。
pub(crate) fn spawn_adapter_with_ctx(
    watcher: Watcher,
    rx: Receiver<FsEvent>,
    ctx: AdapterContext,
) -> EmittingWatcherHandle {
    let join = thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            handler::run_event_loop(rx, ctx);
        }));
        if let Err(payload) = result {
            let msg = panic_payload_string(&payload);
            log::error!("watcher_event adapter thread panicked: {msg}");
        }
    });
    EmittingWatcherHandle {
        watcher: Some(watcher),
        join: Some(join),
    }
}

/// `catch_unwind` payload を可能な範囲で文字列化する。
fn panic_payload_string(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&'static str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    }
}
