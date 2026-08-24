use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::sync::mpsc::{self, TryRecvError};
use std::sync::{Arc, Barrier, Mutex};
use std::thread::{self, JoinHandle};

use spec_board_fs::watcher::handle::WatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

use crate::config::{Config, LabelRegistry, MilestoneRegistry};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{PreparedProjectSession, SessionId, SessionIdentity};

use super::{
    pending_activation_state, wait_for_activation, ActiveProjectResources,
    LogWatcherStopDiagnosticReporter, StagedProjectResources, WatcherActivation,
    WatcherActivationState, WatcherStopDiagnostic, WatcherStopDiagnosticReporter,
};

fn session_identity(session_id: u64) -> SessionIdentity {
    PreparedProjectSession::new(
        ProjectRoot::try_from_str("/project").expect("valid project root"),
        Config::default(),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        crate::task::task_index::ResolvedTaskSet::default(),
    )
    .into_session(SessionId::from_raw(session_id))
    .identity()
}

fn staged_with_handle(
    session_id: u64,
    watcher: Box<dyn WatcherHandle + Send + 'static>,
    activation: WatcherActivation,
) -> StagedProjectResources {
    StagedProjectResources::new(
        session_identity(session_id),
        watcher,
        activation,
        Arc::new(WriteIgnoreRegistry::new()),
    )
}

fn active_with_handle(
    session_id: u64,
    watcher: Box<dyn WatcherHandle + Send + 'static>,
) -> ActiveProjectResources {
    let activation = WatcherActivation::new(pending_activation_state(), thread::current());
    let staged = staged_with_handle(session_id, watcher, activation);
    let (active, activation) = staged.into_ready_parts();
    activation.activate();
    active
}

struct JoiningHandle {
    activation_state: Arc<AtomicU8>,
    cancelled_before_stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl WatcherHandle for JoiningHandle {
    fn stop(mut self: Box<Self>) {
        let state = self.activation_state.load(Ordering::Acquire);
        self.cancelled_before_stop.store(
            state == WatcherActivationState::Cancelled as u8,
            Ordering::Release,
        );
        if let Some(join) = self.join.take() {
            join.join().expect("cancelled worker exits normally");
        }
    }
}

struct CountingHandle {
    stop_count: Arc<AtomicUsize>,
}

impl WatcherHandle for CountingHandle {
    fn stop(self: Box<Self>) {
        self.stop_count.fetch_add(1, Ordering::SeqCst);
    }
}

struct PanickingHandle {
    stop_count: Arc<AtomicUsize>,
}

impl WatcherHandle for PanickingHandle {
    fn stop(self: Box<Self>) {
        self.stop_count.fetch_add(1, Ordering::SeqCst);
        panic!("watcher stop failed");
    }
}

#[derive(Default)]
struct CollectingReporter {
    diagnostics: Mutex<Vec<WatcherStopDiagnostic>>,
}

impl WatcherStopDiagnosticReporter for CollectingReporter {
    fn report(&self, diagnostic: WatcherStopDiagnostic) {
        self.diagnostics
            .lock()
            .expect("diagnostic collector lock")
            .push(diagnostic);
    }
}

struct PanickingReporter {
    report_count: Arc<AtomicUsize>,
}

impl WatcherStopDiagnosticReporter for PanickingReporter {
    fn report(&self, _diagnostic: WatcherStopDiagnostic) {
        self.report_count.fetch_add(1, Ordering::SeqCst);
        panic!("diagnostic reporter failed");
    }
}

#[test]
fn pending_worker_proceeds_only_after_activation() {
    let state = pending_activation_state();
    let worker_state = Arc::clone(&state);
    let rendezvous = Arc::new(Barrier::new(2));
    let worker_rendezvous = Arc::clone(&rendezvous);
    let (result_tx, result_rx) = mpsc::channel();
    let join = thread::spawn(move || {
        worker_rendezvous.wait();
        result_tx
            .send(wait_for_activation(worker_state.as_ref()))
            .expect("send activation result");
    });
    let activation = WatcherActivation::new(state, join.thread().clone());

    rendezvous.wait();
    assert_eq!(Err(TryRecvError::Empty), result_rx.try_recv());

    activation.activate();

    assert!(result_rx.recv().expect("worker activation result"));
    join.join().expect("activated worker exits normally");
}

#[test]
fn staged_drop_cancels_pending_worker_before_stop_and_join() {
    let state = pending_activation_state();
    let worker_state = Arc::clone(&state);
    let rendezvous = Arc::new(Barrier::new(2));
    let worker_rendezvous = Arc::clone(&rendezvous);
    let (result_tx, result_rx) = mpsc::channel();
    let join = thread::spawn(move || {
        worker_rendezvous.wait();
        result_tx
            .send(wait_for_activation(worker_state.as_ref()))
            .expect("send cancellation result");
    });
    let activation = WatcherActivation::new(Arc::clone(&state), join.thread().clone());
    let cancelled_before_stop = Arc::new(AtomicBool::new(false));
    let watcher = JoiningHandle {
        activation_state: state,
        cancelled_before_stop: Arc::clone(&cancelled_before_stop),
        join: Some(join),
    };
    let staged = staged_with_handle(7, Box::new(watcher), activation);

    rendezvous.wait();
    drop(staged);

    assert!(!result_rx.recv().expect("worker cancellation result"));
    assert!(cancelled_before_stop.load(Ordering::Acquire));
}

#[test]
fn staged_drop_isolates_watcher_stop_panic() {
    let stop_count = Arc::new(AtomicUsize::new(0));
    let watcher = PanickingHandle {
        stop_count: Arc::clone(&stop_count),
    };
    let activation = WatcherActivation::new(pending_activation_state(), thread::current());
    let staged = staged_with_handle(11, Box::new(watcher), activation);

    let outcome = catch_unwind(AssertUnwindSafe(|| drop(staged)));

    assert!(outcome.is_ok());
    assert_eq!(1, stop_count.load(Ordering::SeqCst));
}

#[test]
fn displaced_stop_panic_reports_version_and_message() {
    let stop_count = Arc::new(AtomicUsize::new(0));
    let watcher = PanickingHandle {
        stop_count: Arc::clone(&stop_count),
    };
    let active = active_with_handle(13, Box::new(watcher));
    let expected_version = active.version();
    let reporter = CollectingReporter::default();

    active.stop_displaced_best_effort(&reporter);

    assert_eq!(1, stop_count.load(Ordering::SeqCst));
    assert_eq!(
        vec![WatcherStopDiagnostic {
            version: expected_version,
            panic_message: "watcher stop failed".to_string(),
        }],
        *reporter
            .diagnostics
            .lock()
            .expect("diagnostic collector lock"),
    );
}

#[test]
fn diagnostic_reporter_panic_does_not_escape_displaced_cleanup() {
    let stop_count = Arc::new(AtomicUsize::new(0));
    let report_count = Arc::new(AtomicUsize::new(0));
    let active = active_with_handle(
        17,
        Box::new(PanickingHandle {
            stop_count: Arc::clone(&stop_count),
        }),
    );
    let reporter = PanickingReporter {
        report_count: Arc::clone(&report_count),
    };

    let outcome = catch_unwind(AssertUnwindSafe(|| {
        active.stop_displaced_best_effort(&reporter);
    }));

    assert!(outcome.is_ok());
    assert_eq!(1, stop_count.load(Ordering::SeqCst));
    assert_eq!(1, report_count.load(Ordering::SeqCst));
}

#[test]
fn successful_displaced_stop_does_not_report_a_diagnostic() {
    let stop_count = Arc::new(AtomicUsize::new(0));
    let active = active_with_handle(
        19,
        Box::new(CountingHandle {
            stop_count: Arc::clone(&stop_count),
        }),
    );
    let reporter = CollectingReporter::default();

    active.stop_displaced_best_effort(&reporter);

    assert_eq!(1, stop_count.load(Ordering::SeqCst));
    assert!(reporter
        .diagnostics
        .lock()
        .expect("diagnostic collector lock")
        .is_empty());
}

#[test]
fn log_reporter_accepts_a_stop_diagnostic() {
    let diagnostic = WatcherStopDiagnostic {
        version: session_identity(23).version(),
        panic_message: "failure".to_string(),
    };

    LogWatcherStopDiagnosticReporter.report(diagnostic);
}
