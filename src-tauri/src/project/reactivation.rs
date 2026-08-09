//! キャッシュヒット再活性化後のバックグラウンド全量再スキャン。
//!
//! watcher 停止中に発生した disk 変更を、キャッシュ即返しの直後に取り込む。
//! 差分があれば 1 commit で resident state を置換し、`watcher-resync-required`
//! を emit して FE に全量再取得させる（既存の resync 経路の再利用）。
//!
//! 読み込み規則は `open::load_project_data` を共有する。ここへ書き写すと
//! 「再スキャン後の状態 = コールドオープンした場合の状態」という収束不変条件が
//! 二重管理になるため。

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;
use std::thread;

use thiserror::Error;

use crate::config::{
    label_registry_store, milestone_registry_store, ConfigWriter, FsConfigWriter,
    LabelRegistryStore, MilestoneRegistryStore,
};
use crate::project::open::{load_project_data, LoadProjectDataError};
use crate::project_session::{ProjectSessionSnapshot, SessionIdentity};
use crate::state::{AppState, SessionWriteError};
use crate::task::io::{FsTaskIo, TaskIo};
use crate::watcher_event::emit_envelope_if_current;
use crate::watcher_event::envelope::{
    DiagnosticCode, DiagnosticPayload, ResyncReason, ResyncRequiredPayload, EVENT_DIAGNOSTIC,
    EVENT_RESYNC_REQUIRED,
};

/// same-session conflict（新 watcher adapter との commit 競合）の再試行上限。
/// `handle_rescan` の `RESCAN_MAX_ATTEMPTS` と同じ値・同じ趣旨。
const REACTIVATION_MAX_ATTEMPTS: u32 = 3;

/// 再活性化 resync を open 層へ注入する port。
///
/// 本番実装だけが `AppHandle` を持ち、effect 層は trait にしか依存しない
/// （`WatcherFactory` と同じ DI 方針）。
pub(crate) trait ReactivationResyncScheduler {
    /// 再活性化した session の identity を対象に、背景 resync を予約する。
    fn schedule(&self, target: SessionIdentity);
}

/// 本番実装。`AppHandle` を閉じ込め、専用スレッドで resync を実行する。
pub(crate) struct TauriReactivationResyncScheduler {
    app: tauri::AppHandle,
    state: Arc<AppState>,
}

impl TauriReactivationResyncScheduler {
    pub(crate) fn new(app: tauri::AppHandle, state: Arc<AppState>) -> Self {
        Self { app, state }
    }
}

impl ReactivationResyncScheduler for TauriReactivationResyncScheduler {
    fn schedule(&self, target: SessionIdentity) {
        use tauri::Emitter;

        let app = self.app.clone();
        let emit = move |event: &str, payload: serde_json::Value| {
            if let Err(err) = app.emit(event, payload) {
                log::warn!("failed to emit `{event}`: {err}");
            }
        };
        let fallback_app = self.app.clone();
        let state = Arc::clone(&self.state);
        let spawn_target = target.clone();
        let spawned = thread::Builder::new()
            .name("spec-board-reactivation-resync".to_owned())
            .spawn(move || {
                // 背景スレッドの panic は既定では黙って消えるため、adapter thread と
                // 同様に catch_unwind で捕まえて log に残す。
                let result = catch_unwind(AssertUnwindSafe(|| {
                    let labels_store = label_registry_store(spawn_target.project_root().as_path());
                    let milestones_store =
                        milestone_registry_store(spawn_target.project_root().as_path());
                    let outcome = run_reactivation_resync(
                        &state,
                        &spawn_target,
                        &FsTaskIo,
                        &labels_store,
                        &milestones_store,
                        &FsConfigWriter,
                        &emit,
                    );
                    log::debug!("reactivation resync finished: {outcome:?}");
                }));
                if result.is_err() {
                    log::error!("reactivation resync thread panicked");
                }
            });
        let Err(err) = spawned else {
            return;
        };
        // spawn できないと、キャッシュのまま開いた board が disk 変更を取り込む機会を
        // 完全に失う。log だけだと利用者からは「反映されない」としか見えないため、
        // 再スキャン失敗と同じ診断で通知する。
        log::warn!("failed to spawn reactivation resync thread: {err}");
        let fallback_emit = move |event: &str, payload: serde_json::Value| {
            if let Err(err) = fallback_app.emit(event, payload) {
                log::warn!("failed to emit `{event}`: {err}");
            }
        };
        fail_with_diagnostic(
            &self.state,
            &target,
            &fallback_emit,
            "再スキャンを開始できませんでした",
        );
    }
}

/// 背景 resync の終着点。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ReactivationResyncOutcome {
    /// disk とキャッシュに差分がなく、commit も emit もしなかった。
    Unchanged,
    /// 差分を commit し、`watcher-resync-required` を emit した。
    Committed,
    /// lease 取得時点で対象 session が current でなくなっていた。
    Superseded,
    /// disk 読込等に失敗した。resident state は変更していない。
    Failed,
}

/// resync が完了しなかった内部理由（outcome へ潰す前の typed error）。
#[derive(Debug, Error)]
enum ReactivationResyncError {
    #[error(transparent)]
    SessionWrite(#[from] SessionWriteError),
    #[error(transparent)]
    Load(#[from] LoadProjectDataError),
}

/// 再活性化した session を対象に、disk 全量と比較して差分を取り込む。
///
/// emit は identity ガード付きで、対象 session が current でなくなっていれば
/// 送られない。commit が同一 session の並行 writer（新 watcher adapter）と競合した
/// 場合は lease を取り直して最大 3 回再試行する。一律 Superseded 扱いにすると、
/// 直後の disk 変更取り込みが黙って失われるため。
///
/// `config_writer` は reconcile（未知 status のカラム追加）が config.json を
/// 書き出すためだけに使う。追加すべきカラムが無ければ 1 度も呼ばれない。書き込みは
/// `with_project_writer_lease_for` が保持する root 単位の writer gate の内側で
/// 行われるので、`update_columns` / `move_task` / watcher / コールドオープンとは
/// 直列化される。
pub(crate) fn run_reactivation_resync(
    state: &Arc<AppState>,
    target: &SessionIdentity,
    io: &dyn TaskIo,
    labels_store: &dyn LabelRegistryStore,
    milestones_store: &dyn MilestoneRegistryStore,
    config_writer: &dyn ConfigWriter,
    emit: &(dyn Fn(&str, serde_json::Value) + Sync),
) -> ReactivationResyncOutcome {
    let mut attempt = 1;
    loop {
        let result: Result<ReactivationResyncOutcome, ReactivationResyncError> = state
            .with_project_writer_lease_for(target, |snapshot| {
                resync_under_lease(
                    state,
                    snapshot,
                    io,
                    labels_store,
                    milestones_store,
                    config_writer,
                    emit,
                )
            });
        let error = match result {
            Ok(outcome) => return outcome,
            Err(error) => error,
        };
        let conflict = match error {
            ReactivationResyncError::SessionWrite(SessionWriteError::Conflict(conflict)) => {
                conflict
                    .actual
                    .as_ref()
                    .is_some_and(|actual| actual.is_same_session(target))
            }
            // 読込中に同一 session の writer が commit すると、CAS より先に
            // `preflight_session_write` の resource version 照合が落ちる。この経路も
            // 同じ「並行 writer との競合」なので retry 対象に含める。
            ReactivationResyncError::SessionWrite(SessionWriteError::ResourceConflict(
                conflict,
            )) => conflict
                .actual()
                .is_some_and(|actual| actual.session_id == target.version().session_id),
            ReactivationResyncError::SessionWrite(SessionWriteError::NoProjectOpen) => {
                return ReactivationResyncOutcome::Superseded;
            }
            error => {
                log::warn!("reactivation resync failed: {error}");
                return fail_with_diagnostic(state, target, emit, &error.to_string());
            }
        };
        if !conflict {
            return ReactivationResyncOutcome::Superseded;
        }
        if attempt < REACTIVATION_MAX_ATTEMPTS {
            attempt += 1;
            continue;
        }
        log::warn!("reactivation resync gave up after {attempt} attempts");
        return fail_with_diagnostic(
            state,
            target,
            emit,
            "再スキャン中に状態が変化し続けたため復旧できませんでした",
        );
    }
}

/// best-effort 診断 emit（対象 session が current でなければ送られない）。
///
/// 対象 identity ではなく **現在の** identity で emit する。並行 writer が revision を
/// 進めていると target は既に stale で、そのまま渡すと identity ガードに弾かれて
/// 診断が構造的に 1 度も届かない（retry 打ち切り経路は必ずこの状況になる）。
fn fail_with_diagnostic(
    state: &Arc<AppState>,
    target: &SessionIdentity,
    emit: &(dyn Fn(&str, serde_json::Value) + Sync),
    message: &str,
) -> ReactivationResyncOutcome {
    let Ok(current) = state.active_session_identity() else {
        return ReactivationResyncOutcome::Failed;
    };
    if !current.is_same_session(target) {
        return ReactivationResyncOutcome::Failed;
    }
    let _ = emit_envelope_if_current(
        state,
        emit,
        &current,
        EVENT_DIAGNOSTIC,
        DiagnosticPayload {
            code: DiagnosticCode::RescanFailed,
            message: message.to_string(),
            paths: Vec::new(),
        },
    );
    ReactivationResyncOutcome::Failed
}

/// writer lease 下で disk 全量を読み、差分があれば 1 commit + 1 emit で反映する。
///
/// `handle_rescan` と違い write-ignore registry を clear しない。あちらは backend の
/// overflow 通知が「取りこぼした自前 write の marker が残り続ける」状況を伴うが、
/// 本経路は再活性化直後の空 registry から始まり、lease 内なので走査中に新しい marker も
/// 増えない。ここで clear すると、直後に届く自前 write 由来の event を抑止できなくなる。
fn resync_under_lease(
    state: &Arc<AppState>,
    snapshot: &ProjectSessionSnapshot,
    io: &dyn TaskIo,
    labels_store: &dyn LabelRegistryStore,
    milestones_store: &dyn MilestoneRegistryStore,
    config_writer: &dyn ConfigWriter,
    emit: &(dyn Fn(&str, serde_json::Value) + Sync),
) -> Result<ReactivationResyncOutcome, ReactivationResyncError> {
    let loaded = load_project_data(
        snapshot.project_root().as_path(),
        labels_store,
        milestones_store,
        io,
        config_writer,
    )?;

    // 差分判定に config を含めたまま保つこと。watcher の CAS 競合で「disk の
    // config.json は新しいが resident config は古い」乖離が生じうるため、md に
    // 変更が無くても config だけの差分を取り込む本経路が唯一の収束手段になる。
    let unchanged = snapshot.config() == &loaded.config
        && snapshot.labels() == &loaded.labels
        && snapshot.milestones() == &loaded.milestones
        && snapshot.tasks() == &loaded.tasks
        && snapshot.load_warnings() == loaded.load_warnings.as_slice();
    if unchanged {
        return Ok(ReactivationResyncOutcome::Unchanged);
    }

    state.preflight_session_write(snapshot)?;
    let committed = state.commit_session_write(&snapshot.identity(), move |session| {
        session.replace_config(loaded.config);
        session.replace_labels(loaded.labels);
        session.replace_milestones(loaded.milestones);
        session.replace_tasks_and_load_warnings(loaded.tasks, loaded.load_warnings);
    })?;
    emit_envelope_if_current(
        state,
        emit,
        committed.identity(),
        EVENT_RESYNC_REQUIRED,
        ResyncRequiredPayload {
            reason: ResyncReason::Rescan,
        },
    )
    .map_err(SessionWriteError::from)
    .map_err(ReactivationResyncError::from)?;

    Ok(ReactivationResyncOutcome::Committed)
}

/// open フローが scheduler を必要としないテスト向けの no-op 実装。
#[cfg(test)]
pub(crate) struct NoopReactivationScheduler;

#[cfg(test)]
impl ReactivationResyncScheduler for NoopReactivationScheduler {
    fn schedule(&self, _target: SessionIdentity) {}
}

/// 予約された identity を記録するだけのテスト用 scheduler。
#[cfg(test)]
pub(crate) struct CollectingReactivationScheduler {
    scheduled: std::sync::Mutex<Vec<SessionIdentity>>,
}

#[cfg(test)]
impl CollectingReactivationScheduler {
    pub(crate) fn new() -> Self {
        Self {
            scheduled: std::sync::Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn scheduled(&self) -> Vec<SessionIdentity> {
        self.scheduled.lock().expect("scheduler lock").clone()
    }
}

#[cfg(test)]
impl ReactivationResyncScheduler for CollectingReactivationScheduler {
    fn schedule(&self, target: SessionIdentity) {
        self.scheduled.lock().expect("scheduler lock").push(target);
    }
}

#[cfg(test)]
#[path = "reactivation_tests.rs"]
mod reactivation_tests;
