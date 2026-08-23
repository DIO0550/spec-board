use super::active_project_resources::{
    pending_activation_state, StagedProjectResources, WatcherActivation,
};
use super::{AppState, AppStateError, BoxedWatcherHandle, OpenSwapError, ResourceAccessError};

use std::collections::HashMap;
use std::sync::{Arc, Barrier};
use std::thread;

use spec_board_fs::watcher::handle::NoopWatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

use crate::config::{
    CardOrder, Column, Config, LabelDefinition, LabelRegistry, MilestoneDefinition,
    MilestoneRegistry,
};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{PreparedProjectSession, ProjectSession, SessionIdentity};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::task_index::Task;

fn sample_task(id: &str, file_path: &str) -> Task {
    Task {
        draft: false,
        id: id.into(),
        file_path: file_path.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

fn sample_config() -> Config {
    Config {
        version: 1,
        columns: vec![Column {
            name: "Todo".into(),
            order: 0,
            color: None,
            wip_limit: None,
        }],
        card_order: CardOrder::default(),
        done_column: None,
    }
}

fn sample_labels() -> LabelRegistry {
    LabelRegistry {
        labels: vec![LabelDefinition {
            name: "bug".to_string(),
            description: None,
            group: None,
            color: None,
            updated: None,
        }],
    }
}

fn sample_milestones() -> MilestoneRegistry {
    MilestoneRegistry {
        milestones: vec![MilestoneDefinition {
            name: "v0.3".to_string(),
            title: None,
            description: None,
            due: None,
            order: None,
            state: None,
            updated: None,
        }],
    }
}

fn candidate_for(
    state: &AppState,
    root: &str,
    tasks: HashMap<CanonicalTaskPath, Task>,
) -> ProjectSession {
    let session_id = state.reserve_session_id().expect("reserve test session ID");
    PreparedProjectSession::new(
        ProjectRoot::try_from_str(root).expect("valid test root"),
        sample_config(),
        sample_labels(),
        sample_milestones(),
        tasks,
    )
    .into_session(session_id)
}

fn staged_for(identity: SessionIdentity) -> StagedProjectResources {
    StagedProjectResources::new(
        identity,
        Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
        WatcherActivation::new(pending_activation_state(), thread::current()),
        Arc::new(WriteIgnoreRegistry::new()),
    )
}

fn swap_session(
    state: &AppState,
    root: &str,
    tasks: HashMap<CanonicalTaskPath, Task>,
) -> super::OpenSwap {
    let candidate = candidate_for(state, root, tasks);
    let staged = staged_for(candidate.identity());
    state
        .swap_open(candidate, staged)
        .expect("test session swap must succeed")
}

fn assert_resource_conflict(error: ResourceAccessError) {
    let ResourceAccessError::Conflict(conflict) = error else {
        panic!("expected resource conflict, got {error:?}");
    };
    assert_ne!(
        conflict.expected(),
        conflict.actual().expect("active version")
    );
}

fn poison_mutex<F>(state: Arc<AppState>, panic_in_lock: F)
where
    F: FnOnce(&AppState) + Send + 'static,
{
    let join = thread::spawn(move || {
        panic_in_lock(state.as_ref());
    });
    assert!(join.join().is_err());
}

#[test]
fn new_initializes_all_fields_to_empty() {
    let state = AppState::new();

    assert_eq!(None, state.test_project_root().expect("readable"));
    assert_eq!(None, state.test_config().expect("readable"));
    assert_eq!(None, state.test_labels().expect("readable"));
    assert!(state.test_tasks_snapshot().expect("readable").is_empty());
}

#[test]
fn open_swap_replaces_at_most_one_active_resource_set() {
    let state = AppState::new();
    let first = swap_session(&state, "/tmp/project-a", HashMap::new());
    let first_version = first.snapshot.version();
    assert!(first.displaced_resources.is_none());

    let second = swap_session(&state, "/tmp/project-b", HashMap::new());
    let displaced = second
        .displaced_resources
        .expect("second swap displaces the first resources");

    assert_eq!(first_version, displaced.version());
    assert_eq!(
        second.snapshot.version(),
        state.require_session_snapshot().unwrap().version()
    );
    assert_eq!(
        second.snapshot.version(),
        state
            .resources
            .lock()
            .expect("resource lock")
            .as_ref()
            .expect("active resources")
            .version()
    );
}

#[test]
fn stale_resource_access_is_rejected_and_old_arc_cannot_touch_new_registry() {
    let state = AppState::new();
    let first = swap_session(&state, "/tmp/project-a", HashMap::new());
    let old_access = state
        .resources_for(first.snapshot.version())
        .expect("first resources");

    let second = swap_session(&state, "/tmp/project-b", HashMap::new());
    let error = state
        .resources_for(first.snapshot.version())
        .expect_err("stale version must be rejected");
    assert_resource_conflict(error);

    old_access
        .write_ignore()
        .register("/tmp/project-a/tasks/old.md")
        .expect("old registry remains independently usable");
    let current_access = state
        .resources_for(second.snapshot.version())
        .expect("current resources");

    assert_eq!(1, old_access.write_ignore().len().unwrap());
    assert!(current_access.write_ignore().is_empty().unwrap());
}

#[test]
fn session_commit_updates_domain_and_resource_revision_together() {
    let state = AppState::new();
    let opened = swap_session(&state, "/tmp/project-a", HashMap::new());
    let expected = opened.snapshot.identity();

    let committed = state
        .commit_session(&expected, |session| {
            session.tasks_mut().insert(
                CanonicalTaskPath::new("tasks/a.md"),
                sample_task("a", "tasks/a.md"),
            );
        })
        .expect("matching commit succeeds");

    assert_eq!(1, committed.version().revision.as_u64());
    assert_eq!(
        committed.version(),
        state.require_session_snapshot().unwrap().version()
    );
    assert_eq!(
        committed.version(),
        state
            .resources_for(committed.version())
            .expect("resources advance with domain")
            .version()
    );
    assert_resource_conflict(
        state
            .resources_for(expected.version())
            .expect_err("old revision is stale"),
    );
}

#[test]
fn same_project_writers_read_fresh_snapshots_under_one_gate_and_keep_both_updates() {
    let state = Arc::new(AppState::new());
    swap_session(&state, "/tmp/project-a", HashMap::new());
    let start = Arc::new(Barrier::new(3));

    let handles: Vec<_> = [("a", "tasks/a.md"), ("b", "tasks/b.md")]
        .into_iter()
        .map(|(id, path)| {
            let state = Arc::clone(&state);
            let start = Arc::clone(&start);
            thread::spawn(move || {
                let target = state.active_session_identity().expect("active target");
                let gate = state
                    .writer_gate(target.project_root())
                    .expect("writer gate");
                start.wait();
                let _lease = state.lock_writer_gate(gate.as_ref()).expect("writer lease");
                let snapshot = state.require_session_snapshot().expect("fresh snapshot");
                snapshot
                    .ensure_same_session(&target)
                    .expect("same open session remains active");
                let expected = snapshot.identity();
                state
                    .commit_session(&expected, |session| {
                        session
                            .tasks_mut()
                            .insert(CanonicalTaskPath::new(path), sample_task(id, path));
                    })
                    .expect("serialized commit");
            })
        })
        .collect();

    start.wait();
    for handle in handles {
        handle.join().expect("writer thread");
    }

    let snapshot = state.require_session_snapshot().expect("final snapshot");
    assert_eq!(2, snapshot.tasks().len());
    assert!(snapshot
        .tasks()
        .contains_key(&CanonicalTaskPath::new("tasks/a.md")));
    assert!(snapshot
        .tasks()
        .contains_key(&CanonicalTaskPath::new("tasks/b.md")));
    assert_eq!(2, snapshot.version().revision.as_u64());
}

#[test]
fn target_lookup_before_same_path_reopen_is_rejected_before_side_effects() {
    let state = Arc::new(AppState::new());
    swap_session(&state, "/tmp/project-a", HashMap::new());
    let target_ready = Arc::new(Barrier::new(2));
    let reopened = Arc::new(Barrier::new(2));
    let writer_state = Arc::clone(&state);
    let writer_ready = Arc::clone(&target_ready);
    let writer_reopened = Arc::clone(&reopened);

    let writer = thread::spawn(move || {
        let target = writer_state
            .active_session_identity()
            .expect("first session target");
        writer_ready.wait();
        writer_reopened.wait();
        let gate = writer_state
            .writer_gate(target.project_root())
            .expect("writer gate");
        let _lease = writer_state
            .lock_writer_gate(gate.as_ref())
            .expect("writer lease");
        writer_state
            .require_session_snapshot()
            .expect("fresh snapshot")
            .ensure_same_session(&target)
    });

    target_ready.wait();
    swap_session(&state, "/tmp/project-a", HashMap::new());
    reopened.wait();

    let conflict = writer
        .join()
        .expect("writer thread")
        .expect_err("reopen must invalidate the old target");
    assert_ne!(
        conflict.expected.version().session_id,
        conflict.actual.expect("new session").version().session_id
    );
}

#[test]
fn holding_project_a_gate_does_not_block_project_b_gate() {
    let state = Arc::new(AppState::new());
    let gate_a = state
        .writer_gate(&ProjectRoot::try_from_str("/tmp/project-a").unwrap())
        .expect("gate A");
    let _lease_a = state.lock_writer_gate(gate_a.as_ref()).expect("lease A");
    let start = Arc::new(Barrier::new(2));
    let worker_state = Arc::clone(&state);
    let worker_start = Arc::clone(&start);

    let worker = thread::spawn(move || {
        let gate_b = worker_state
            .writer_gate(&ProjectRoot::try_from_str("/tmp/project-b").unwrap())
            .expect("gate B");
        worker_start.wait();
        let acquired = gate_b.try_lock().is_ok();
        acquired
    });

    start.wait();
    assert!(worker.join().expect("project B worker"));
}

#[test]
fn poisoned_writer_gate_is_reported_as_typed_error() {
    let state = AppState::new();
    let gate = state
        .writer_gate(&ProjectRoot::try_from_str("/tmp/project-a").unwrap())
        .expect("writer gate");
    let poison = Arc::clone(&gate);
    let _ = thread::spawn(move || {
        let _guard = poison.lock().expect("lock before poison");
        panic!("poison writer gate");
    })
    .join();

    assert_eq!(
        AppStateError::WriterGatePoisoned,
        state
            .lock_writer_gate(gate.as_ref())
            .expect_err("poison must be typed")
    );
}

#[test]
fn poisoned_resource_lock_is_reported_without_returning_partial_access() {
    let state = Arc::new(AppState::new());
    let opened = swap_session(&state, "/tmp/project-a", HashMap::new());
    poison_mutex(Arc::clone(&state), |state| {
        let _guard = state.resources.lock().expect("lock before poison");
        panic!("poison resources");
    });

    assert_eq!(
        ResourceAccessError::State(AppStateError::ResourceLockPoisoned),
        state
            .resources_for(opened.snapshot.version())
            .expect_err("poison must be typed")
    );
}

#[test]
fn stale_identity_does_not_consume_event_sequence_after_switch() {
    let state = AppState::new();
    let first = swap_session(&state, "/tmp/project-a", HashMap::new());
    assert_eq!(
        1,
        state
            .next_event_seq_if_current(&first.snapshot.identity())
            .unwrap()
            .expect("current identity")
            .as_u64()
    );

    let second = swap_session(&state, "/tmp/project-b", HashMap::new());
    assert_eq!(
        None,
        state
            .next_event_seq_if_current(&first.snapshot.identity())
            .unwrap()
    );
    assert_eq!(
        2,
        state
            .next_event_seq_if_current(&second.snapshot.identity())
            .unwrap()
            .expect("new current identity")
            .as_u64()
    );
}

#[test]
fn swap_from_idle_returns_no_displaced_session() {
    let state = AppState::new();

    let swap = swap_session(&state, "/tmp/project-a", HashMap::new());

    assert!(swap.displaced_session.is_none());
}

#[test]
fn same_root_swap_does_not_displace_a_session_into_the_cache() {
    let state = AppState::new();
    swap_session(&state, "/tmp/project-a", HashMap::new());

    let reopened = swap_session(&state, "/tmp/project-a", HashMap::new());

    assert!(
        reopened.displaced_session.is_none(),
        "same-root reopen must not leave a stale entry for the foreground project"
    );
}

#[test]
fn take_discards_a_cache_entry_older_than_the_resident_session() {
    let state = AppState::new();
    let stale = candidate_for(&state, "/tmp/project-a", HashMap::new());
    swap_session(&state, "/tmp/project-a", HashMap::new());
    state
        .stash_background_session(stale)
        .expect("a concurrent open can stash after the root became resident again");

    let taken = state
        .take_background_session(&ProjectRoot::try_from_str("/tmp/project-a").unwrap())
        .expect("cache lock healthy");

    assert!(
        taken.is_none(),
        "entries behind the resident session are dropped"
    );
}

#[test]
fn swap_over_loaded_project_returns_the_displaced_session() {
    let state = AppState::new();
    let first = swap_session(&state, "/tmp/project-a", HashMap::new());

    let second = swap_session(&state, "/tmp/project-b", HashMap::new());

    let displaced = second
        .displaced_session
        .expect("second swap displaces the first session");
    assert_eq!(first.snapshot.identity(), displaced.identity());
}

#[test]
fn take_background_session_removes_the_entry() {
    let state = AppState::new();
    let root = ProjectRoot::try_from_str("/tmp/project-a").expect("valid test root");
    state
        .stash_background_session(candidate_for(&state, "/tmp/project-a", HashMap::new()))
        .expect("stash succeeds");

    let taken = state
        .take_background_session(&root)
        .expect("cache lock healthy");
    let taken_again = state
        .take_background_session(&root)
        .expect("cache lock healthy");

    assert!(taken.is_some());
    assert!(taken_again.is_none());
}

#[test]
fn take_background_session_misses_for_unknown_root() {
    let state = AppState::new();

    let taken = state
        .take_background_session(&ProjectRoot::try_from_str("/tmp/never-opened").unwrap())
        .expect("missing entry is not an error");

    assert!(taken.is_none());
}

#[test]
fn stash_replaces_an_older_session_for_the_same_root() {
    let state = AppState::new();
    let older = candidate_for(&state, "/tmp/project-a", HashMap::new());
    let newer = candidate_for(&state, "/tmp/project-a", HashMap::new());
    let newer_id = newer.version().session_id;
    state.stash_background_session(older).expect("stash older");

    state.stash_background_session(newer).expect("stash newer");

    let kept = state
        .take_background_session(&ProjectRoot::try_from_str("/tmp/project-a").unwrap())
        .expect("cache lock healthy")
        .expect("entry exists");
    assert_eq!(newer_id, kept.version().session_id);
}

#[test]
fn stash_keeps_the_session_with_the_newer_session_id() {
    let state = AppState::new();
    let older = candidate_for(&state, "/tmp/project-a", HashMap::new());
    let newer = candidate_for(&state, "/tmp/project-a", HashMap::new());
    let newer_id = newer.version().session_id;
    state.stash_background_session(newer).expect("stash newer");

    state
        .stash_background_session(older)
        .expect("stashing an older session is accepted but must not win");

    let kept = state
        .take_background_session(&ProjectRoot::try_from_str("/tmp/project-a").unwrap())
        .expect("cache lock healthy")
        .expect("entry exists");
    assert_eq!(newer_id, kept.version().session_id);
}

#[test]
fn identity_mismatch_rejects_open_swap_before_replacing_domain() {
    let state = AppState::new();
    let candidate = candidate_for(&state, "/tmp/project-a", HashMap::new());
    let other = candidate_for(&state, "/tmp/project-b", HashMap::new());
    let staged = staged_for(other.identity());

    let error = match state.swap_open(candidate, staged) {
        Ok(_) => panic!("identity mismatch must fail"),
        Err(error) => error,
    };

    assert!(matches!(error, OpenSwapError::IdentityMismatch { .. }));
    assert!(state.session_snapshot().expect("domain lock").is_none());
    assert!(state.resources.lock().expect("resource lock").is_none());
}
