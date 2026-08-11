//! `spec_board_fs::watcher::core::Watcher` の `FileChangeBatch` を読み込み、
//! `AppState` の `tasks_cache` を差分更新したうえで `task-created` /
//! `task-updated` / `task-deleted` を `tauri::AppHandle::emit` で配信する
//! adapter 層。
//!
//! # モジュール構成
//!
//! - `prepare_watcher(root)`: `Watcher::start` を呼んで `(Watcher, Receiver)`
//!   を確保するだけ。`open_project_impl` の AppState commit より前に
//!   実行される 1 段目。
//! - `stage_adapter(...)`: 既に確保済みの watcher / rx から adapter thread と
//!   handle を fallible に構築する。worker は activation latch が `Pending` の
//!   間 park し、open swap が `Active` にするまで event を処理しない。
//! - `handler::handle_batch`: 1 つの `FileChangeBatch` を決定的な順序で
//!   1 件ずつ処理する。テストはここに対して書く。
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
//! 一切取得しない（displaced stop 中の deadlock を防ぐ）。

pub(crate) mod envelope;
#[cfg(test)]
mod envelope_fixture;
pub(crate) mod handler;
#[cfg(test)]
pub(crate) mod watcher_test_support;

#[cfg(test)]
mod reconcile_tests;
#[cfg(test)]
mod tests;

use std::path::Path;
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use tauri::{AppHandle, Emitter};

use crate::config::{ConfigWriter, FsConfigWriter};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{SessionId, SessionIdentity};
use crate::state::active_project_resources::{
    pending_activation_state, wait_for_activation, StagedProjectResources, WatcherActivation,
};
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_key::ProjectKey;
use crate::state::tasks_revision::TasksRevision;
use crate::state::{AppState, AppStateError, BoxedWatcherHandle};
use crate::task::io::{FsTaskIo, TaskIo};
use spec_board_fs::watcher::core::{Watcher, WatcherError};
use spec_board_fs::watcher::file_change_batch::FileChangeBatch;
use spec_board_fs::watcher::handle::WatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

/// emit の抽象化（本番 = `AppHandle::emit`、テスト = Vec push）。
pub(crate) type EmitFn = Box<dyn Fn(&str, serde_json::Value) + Send + Sync + 'static>;

/// adapter スレッドが共有する不変コンテキスト。
pub(crate) struct AdapterContext {
    pub(crate) project_root: ProjectRoot,
    pub(crate) session_id: SessionId,
    pub(crate) state: Arc<AppState>,
    pub(crate) emit: EmitFn,
    /// MD ファイル I/O ポート。`handle_upsert` の `fs::read` を本 port 経由に
    /// 置換することで、effect 層から `std::fs::*` の直接呼び出しを排除する。
    pub(crate) io: Arc<dyn TaskIo>,
    /// config.json 書き出しポート。未知 status のカラム追加（reconcile）でのみ使い、
    /// 追加すべきカラムが無い通常の event では 1 度も呼ばれない。open 側と同じ
    /// `ConfigWriter` を共有することで、書き込み失敗をテストから注入できる。
    pub(crate) config_writer: Arc<dyn ConfigWriter + Send + Sync>,
}

/// 実 `WatcherHandle` 実装。Watcher Drop + adapter join を内包する。
///
/// `watcher` が `Some` のうちは notify バックエンドの送信側が生きている。
/// `stop()` で `watcher` を drop して送信側を切断したのち adapter スレッドを
/// join することで、同期的に停止が完了する。
pub(crate) struct EmittingWatcherHandle {
    watcher: Option<Watcher>,
    join: Option<JoinHandle<()>>,
}

impl WatcherHandle for EmittingWatcherHandle {
    fn stop(&mut self) {
        // (1) Watcher を drop → Receiver<FileChangeBatch> Disconnected
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
pub(crate) fn prepare_watcher(
    root: &Path,
) -> Result<(Watcher, Receiver<FileChangeBatch>), WatcherError> {
    Watcher::start(root)
}

/// `open_project_impl` の **AppState swap 前**に呼び出される 2 段目。
///
/// thread/handle/registry をすべて構築するが、worker は activation latch で park
/// する。thread spawn が失敗した場合は `WatcherError::Io` を返し、candidate
/// resources は resident state に一切入らない。
pub(crate) fn stage_adapter(
    app: &AppHandle,
    state: Arc<AppState>,
    identity: SessionIdentity,
    watcher: Watcher,
    rx: Receiver<FileChangeBatch>,
) -> Result<StagedProjectResources, WatcherError> {
    let app_for_emit = app.clone();
    let emit: EmitFn = Box::new(move |event, payload| {
        if let Err(err) = app_for_emit.emit(event, payload) {
            log::warn!("failed to emit `{event}`: {err}");
        }
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state,
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    stage_adapter_with_ctx(watcher, rx, ctx, identity)
}

/// 既に組み立て済みの context から paused adapter resources を stage する。
pub(crate) fn stage_adapter_with_ctx(
    watcher: Watcher,
    rx: Receiver<FileChangeBatch>,
    ctx: AdapterContext,
    identity: SessionIdentity,
) -> Result<StagedProjectResources, WatcherError> {
    let activation_state = pending_activation_state();
    let worker_state = Arc::clone(&activation_state);
    let join = thread::Builder::new()
        .name("spec-board-watcher-adapter".to_owned())
        .spawn(move || {
            if !wait_for_activation(worker_state.as_ref()) {
                return;
            }
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                handler::run_event_loop(rx, ctx);
            }));
            if let Err(payload) = result {
                let msg = panic_payload_string(&payload);
                log::error!("watcher_event adapter thread panicked: {msg}");
            }
        })
        .map_err(WatcherError::Io)?;
    let activation = WatcherActivation::new(activation_state, join.thread().clone());
    let handle = EmittingWatcherHandle {
        watcher: Some(watcher),
        join: Some(join),
    };

    Ok(StagedProjectResources::new(
        identity,
        Box::new(handle) as BoxedWatcherHandle,
        activation,
        Arc::new(WriteIgnoreRegistry::new()),
    ))
}

/// identity が current のときだけ envelope を emit する、adapter 外からも使える実装。
///
/// eventSeq の identity 検証と採番は同じ domain critical section で行われる。
/// 採番後に emit が失敗しても番号は戻さず、FE の gap recovery に委ねる。
pub(crate) fn emit_envelope_if_current<P: envelope::EnvelopePayload + serde::Serialize>(
    state: &AppState,
    emit: &(dyn Fn(&str, serde_json::Value) + Sync),
    identity: &SessionIdentity,
    event_name: &str,
    payload: P,
) -> Result<(), AppStateError> {
    let Some(event_seq) = state.next_event_seq_if_current(identity)? else {
        return Ok(());
    };
    let version = identity.version();
    let project_key = ProjectKey::from_root(identity.project_root().as_path());
    let generation = ProjectGeneration::from_raw(version.session_id.as_u64());
    let revision = TasksRevision::from_raw(version.revision.as_u64());
    let built = envelope::build_envelope(&project_key, generation, revision, event_seq, payload);
    match serde_json::to_value(&built) {
        Ok(value) => emit(event_name, value),
        Err(err) => {
            log::warn!("watcher_event: failed to serialize `{event_name}` envelope: {err}");
        }
    }
    Ok(())
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
