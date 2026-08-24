//! 現在のproject sessionに紐づくwatcherとwrite-ignore registryの所有境界。
//!
//! watcherはopen commit前にstageされるが、workerはactivation latchが
//! [`WatcherActivationState::Active`]になるまでevent処理を開始しない。stageが
//! commitされずdropされた場合は、workerを先にcancelしてからwatcherをstopする。

use std::any::Any;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::thread::{self, Thread};

use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;
use thiserror::Error;

use crate::project_session::{SessionIdentity, SessionVersion};

use super::BoxedWatcherHandle;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
enum WatcherActivationState {
    Pending = 0,
    Active = 1,
    Cancelled = 2,
}

/// stage済みwatcher workerをcommit後に開始、またはabandon時にcancelするlatch。
pub(crate) struct WatcherActivation {
    state: Arc<AtomicU8>,
    thread: Thread,
}

impl WatcherActivation {
    /// workerと共有するstate、およびpark解除対象threadからlatchを作る。
    pub(crate) fn new(state: Arc<AtomicU8>, thread: Thread) -> Self {
        Self { state, thread }
    }

    /// workerへcommit完了をreleaseし、event loopへ進める。
    pub(crate) fn activate(self) {
        self.state
            .store(WatcherActivationState::Active as u8, Ordering::Release);
        self.thread.unpark();
    }

    /// workerへstage破棄をreleaseし、eventを処理せず終了させる。
    fn cancel(self) {
        self.state
            .store(WatcherActivationState::Cancelled as u8, Ordering::Release);
        self.thread.unpark();
    }
}

/// worker spawn前に共有するpending activation stateを作る。
pub(crate) fn pending_activation_state() -> Arc<AtomicU8> {
    Arc::new(AtomicU8::new(WatcherActivationState::Pending as u8))
}

/// activation stateが決まるまでworkerをparkする。
///
/// spurious wakeupとactivate/park間のraceを吸収するため、Acquire loadをloopする。
/// Activeなら`true`、Cancelledなら`false`を返す。
pub(crate) fn wait_for_activation(state: &AtomicU8) -> bool {
    loop {
        match state.load(Ordering::Acquire) {
            value if value == WatcherActivationState::Pending as u8 => thread::park(),
            value if value == WatcherActivationState::Active as u8 => return true,
            value if value == WatcherActivationState::Cancelled as u8 => return false,
            value => unreachable!("invalid watcher activation state: {value}"),
        }
    }
}

/// open commit前に完全構築され、activationだけを保留しているproject resources。
pub(crate) struct StagedProjectResources {
    identity: SessionIdentity,
    watcher: Option<BoxedWatcherHandle>,
    activation: Option<WatcherActivation>,
    write_ignore: Arc<WriteIgnoreRegistry>,
}

impl StagedProjectResources {
    /// candidate session専用のstage済みresourcesを作る。
    pub(crate) fn new(
        identity: SessionIdentity,
        watcher: BoxedWatcherHandle,
        activation: WatcherActivation,
        write_ignore: Arc<WriteIgnoreRegistry>,
    ) -> Self {
        Self {
            identity,
            watcher: Some(watcher),
            activation: Some(activation),
            write_ignore,
        }
    }

    /// resourcesが紐づくcandidate session identityを返す。
    #[must_use]
    pub(crate) fn identity(&self) -> &SessionIdentity {
        &self.identity
    }

    /// commit済みresourcesと、まだreleaseしていないactivation latchへ分離する。
    ///
    /// watcherとactivationを`take`してから空のstageをdropするため、stage cleanupは
    /// 二重実行されない。callerはstate swap完了後にlatchをactivateする。
    pub(crate) fn into_ready_parts(mut self) -> (ActiveProjectResources, WatcherActivation) {
        let watcher = self
            .watcher
            .take()
            .expect("staged watcher is present until ready conversion");
        let activation = self
            .activation
            .take()
            .expect("staged activation is present until ready conversion");
        let resources = ActiveProjectResources {
            version: self.identity.version(),
            watcher: Some(watcher),
            write_ignore: Arc::clone(&self.write_ignore),
        };

        (resources, activation)
    }
}

impl Drop for StagedProjectResources {
    fn drop(&mut self) {
        if let Some(activation) = self.activation.take() {
            activation.cancel();
        }

        if let Some(watcher) = self.watcher.take() {
            let _ = catch_unwind(AssertUnwindSafe(|| watcher.stop()));
        }
    }
}

/// 現在のproject sessionだけが利用できるwatcher関連resources。
pub(crate) struct ActiveProjectResources {
    version: SessionVersion,
    watcher: Option<BoxedWatcherHandle>,
    write_ignore: Arc<WriteIgnoreRegistry>,
}

impl ActiveProjectResources {
    /// resourcesが紐づくsession versionを返す。
    #[must_use]
    pub(crate) const fn version(&self) -> SessionVersion {
        self.version
    }

    /// domain commit後のrevisionへresource identityを同期する。
    pub(super) fn update_version(&mut self, version: SessionVersion) {
        self.version = version;
    }

    /// resources lock外へ持ち出せるsession-scoped accessを作る。
    pub(super) fn session_access(&self) -> SessionResourceAccess {
        SessionResourceAccess {
            version: self.version,
            write_ignore: Arc::clone(&self.write_ignore),
        }
    }

    /// swapで退避されたwatcherを停止し、panicをdiagnosticへ変換する。
    ///
    /// watcherのstop/join panicとreporter自身のpanicは、どちらも新sessionのopen
    /// 成功へ伝播させない。
    pub(crate) fn stop_displaced_best_effort(
        mut self,
        reporter: &dyn WatcherStopDiagnosticReporter,
    ) {
        let Some(watcher) = self.watcher.take() else {
            return;
        };
        let stop_result = catch_unwind(AssertUnwindSafe(|| watcher.stop()));
        let Err(payload) = stop_result else {
            return;
        };
        let diagnostic = WatcherStopDiagnostic {
            version: self.version,
            panic_message: panic_message(payload.as_ref()),
        };
        let _ = catch_unwind(AssertUnwindSafe(|| reporter.report(diagnostic)));
    }
}

/// identity検証後にresources lock外へ持ち出すwrite-ignore access。
#[derive(Clone, Debug)]
pub(crate) struct SessionResourceAccess {
    version: SessionVersion,
    write_ignore: Arc<WriteIgnoreRegistry>,
}

impl SessionResourceAccess {
    /// accessが許可されたsession versionを返す。
    #[must_use]
    pub(crate) const fn version(&self) -> SessionVersion {
        self.version
    }

    /// session専用write-ignore registryを返す。
    #[must_use]
    pub(crate) fn write_ignore(&self) -> &WriteIgnoreRegistry {
        self.write_ignore.as_ref()
    }
}

/// 要求versionとactive resources versionが一致しない。
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[error("active project resource conflict: expected {expected:?}, actual {actual:?}")]
pub struct SessionResourceConflict {
    expected: SessionVersion,
    actual: Option<SessionVersion>,
}

impl SessionResourceConflict {
    /// expectedとlock内で観測したactual versionからconflictを作る。
    pub(super) const fn new(expected: SessionVersion, actual: Option<SessionVersion>) -> Self {
        Self { expected, actual }
    }

    /// callerが要求したsession versionを返す。
    #[must_use]
    pub const fn expected(&self) -> SessionVersion {
        self.expected
    }

    /// lock内で観測したactive resources versionを返す。
    #[must_use]
    pub const fn actual(&self) -> Option<SessionVersion> {
        self.actual
    }
}

/// displaced watcherの停止失敗metadata。
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct WatcherStopDiagnostic {
    pub(crate) version: SessionVersion,
    pub(crate) panic_message: String,
}

/// watcher停止失敗の出力先。
pub(crate) trait WatcherStopDiagnosticReporter: Send + Sync {
    /// watcher停止panicを通知する。
    fn report(&self, diagnostic: WatcherStopDiagnostic);
}

/// watcher停止panicをapplication logへ出す本番reporter。
pub(crate) struct LogWatcherStopDiagnosticReporter;

impl WatcherStopDiagnosticReporter for LogWatcherStopDiagnosticReporter {
    fn report(&self, diagnostic: WatcherStopDiagnostic) {
        log::warn!(
            "displaced watcher stop panicked: version={:?} error={}",
            diagnostic.version,
            diagnostic.panic_message,
        );
    }
}

fn panic_message(payload: &(dyn Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "<non-string panic payload>".to_string()
}

#[cfg(test)]
#[path = "active_project_resources_tests.rs"]
mod active_project_resources_tests;
