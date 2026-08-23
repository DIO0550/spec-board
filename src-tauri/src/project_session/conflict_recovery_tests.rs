use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

use spec_board_fs::watcher::handle::NoopWatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;
use tempfile::tempdir;

use crate::config::column_name::ColumnName;
use crate::config::{
    CardOrder, Column, Config, LabelDefinition, LabelRegistry, LabelRegistryStore, LoadLabelsError,
    LoadMilestonesError, MilestoneDefinition, MilestoneRegistry, MilestoneRegistryStore,
    SaveLabelsError, SaveMilestonesError,
};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{
    PreparedProjectSession, ProjectSessionCommitError, ProjectSessionSnapshot, SessionConflict,
    SessionIdentity,
};
use crate::state::active_project_resources::{
    pending_activation_state, StagedProjectResources, WatcherActivation,
};
use crate::state::{AppState, BoxedWatcherHandle, CommitSessionError, SessionWriteError};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::io::FsTaskIo;
use crate::task::task_index::Task;

use super::{resync_if_same_project_under_lease, ResyncError, ResyncSource};

struct StubLabelStore {
    loaded: LabelRegistry,
    load_calls: AtomicUsize,
}

impl StubLabelStore {
    fn new(loaded: LabelRegistry) -> Self {
        Self {
            loaded,
            load_calls: AtomicUsize::new(0),
        }
    }

    fn load_calls(&self) -> usize {
        self.load_calls.load(Ordering::SeqCst)
    }
}

impl LabelRegistryStore for StubLabelStore {
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError> {
        self.load_calls.fetch_add(1, Ordering::SeqCst);
        Ok(self.loaded.clone())
    }

    fn save(&self, _registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        unreachable!("resync never saves a registry")
    }
}

struct RevisionAdvancingLabelStore<'a> {
    state: &'a AppState,
    expected: SessionIdentity,
    concurrent: LabelRegistry,
    loaded: LabelRegistry,
}

impl LabelRegistryStore for RevisionAdvancingLabelStore<'_> {
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError> {
        let concurrent = self.concurrent.clone();
        self.state
            .commit_session_write(&self.expected, move |session| {
                session.replace_labels(concurrent);
            })
            .expect("simulated concurrent commit");
        Ok(self.loaded.clone())
    }

    fn save(&self, _registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        unreachable!("resync never saves a registry")
    }
}

struct StubMilestoneStore {
    loaded: MilestoneRegistry,
}

impl MilestoneRegistryStore for StubMilestoneStore {
    fn load(&self) -> Result<MilestoneRegistry, LoadMilestonesError> {
        Ok(self.loaded.clone())
    }

    fn save(&self, _registry: &MilestoneRegistry) -> Result<(), SaveMilestonesError> {
        unreachable!("resync never saves a registry")
    }
}

fn config_with_default_status(status: &str) -> Config {
    Config {
        version: 1,
        columns: vec![Column {
            name: ColumnName::from_lenient(status),
            order: 0,
            color: None,
            wip_limit: None,
        }],
        card_order: CardOrder::default(),
        done_column: None,
    }
}

fn labels(name: &str) -> LabelRegistry {
    LabelRegistry {
        labels: vec![LabelDefinition {
            name: name.to_string(),
            description: None,
            group: None,
            color: None,
            updated: None,
        }],
    }
}

fn milestones(name: &str) -> MilestoneRegistry {
    MilestoneRegistry {
        milestones: vec![MilestoneDefinition {
            name: name.to_string(),
            title: None,
            description: None,
            due: None,
            order: None,
            state: None,
            updated: None,
        }],
    }
}

fn sample_task(path: &str, title: &str) -> Task {
    Task {
        draft: false,
        id: path.into(),
        file_path: path.into(),
        title: title.into(),
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

fn staged_for(identity: SessionIdentity) -> StagedProjectResources {
    StagedProjectResources::new(
        identity,
        Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
        WatcherActivation::new(pending_activation_state(), thread::current()),
        Arc::new(WriteIgnoreRegistry::new()),
    )
}

fn open_session(
    state: &AppState,
    root: ProjectRoot,
    config: Config,
    labels: LabelRegistry,
    milestones: MilestoneRegistry,
    tasks: HashMap<CanonicalTaskPath, Task>,
) -> ProjectSessionSnapshot {
    let session_id = state.reserve_session_id().expect("reserve session ID");
    let candidate = PreparedProjectSession::new(root, config, labels, milestones, tasks)
        .into_session(session_id);
    let staged = staged_for(candidate.identity());
    state
        .swap_open(candidate, staged)
        .expect("open swap")
        .snapshot
}

fn stale_revision_conflict(state: &AppState, expected: &SessionIdentity) -> SessionConflict {
    state
        .commit_session(expected, |_| ())
        .expect("advance current revision");
    let error = state
        .commit_session(expected, |_| panic!("stale closure must not run"))
        .expect_err("stale revision must conflict");
    let CommitSessionError::Domain(ProjectSessionCommitError::Conflict(conflict)) = error else {
        panic!("expected session conflict, got {error:?}");
    };
    conflict
}

fn conflict_after_switch(state: &AppState, expected: &SessionIdentity) -> SessionConflict {
    let error = state
        .commit_session(expected, |_| panic!("switched closure must not run"))
        .expect_err("switched session must conflict");
    let CommitSessionError::Domain(ProjectSessionCommitError::Conflict(conflict)) = error else {
        panic!("expected session conflict, got {error:?}");
    };
    conflict
}

fn assert_same_snapshot(expected: &ProjectSessionSnapshot, actual: &ProjectSessionSnapshot) {
    assert_eq!(expected.version(), actual.version());
    assert_eq!(expected.project_root(), actual.project_root());
    assert_eq!(expected.config(), actual.config());
    assert_eq!(expected.labels(), actual.labels());
    assert_eq!(expected.milestones(), actual.milestones());
    assert_eq!(expected.tasks(), actual.tasks());
}

#[test]
fn task_resync_keeps_session_id_and_commits_all_rebuilt_tasks_once() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    std::fs::write(
        dir.path().join("fresh.md"),
        "---\ntitle: Fresh from disk\nstatus: Todo\n---\nbody\n",
    )
    .expect("write task");
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("resident-label"),
        milestones("resident-milestone"),
        HashMap::from([(
            CanonicalTaskPath::new("stale.md"),
            sample_task("stale.md", "Stale resident"),
        )]),
    );
    let conflict = stale_revision_conflict(&state, &initial.identity());
    state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &conflict,
                ResyncSource::Tasks { task_io: &FsTaskIo },
            )
        })
        .expect("write lease")
        .expect("same-session task resync");

    let recovered = state.require_session_snapshot().expect("snapshot");
    assert_eq!(initial.version().session_id, recovered.version().session_id);
    assert_eq!(2, recovered.version().revision.as_u64());
    assert_eq!(labels("resident-label"), *recovered.labels());
    assert_eq!(milestones("resident-milestone"), *recovered.milestones());
    assert_eq!(1, recovered.tasks().len());
    assert_eq!(
        "Fresh from disk",
        recovered.tasks()[&CanonicalTaskPath::new("fresh.md")]
            .title
            .as_str()
    );
}

#[test]
fn config_and_tasks_resync_uses_reloaded_config_for_missing_task_status() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    std::fs::write(
        dir.path().join("fresh.md"),
        "---\ntitle: Fresh from disk\n---\nbody\n",
    )
    .expect("write task");
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let conflict = stale_revision_conflict(&state, &initial.identity());
    let recovered_config = config_with_default_status("Review");
    let loader = |_root: &Path| Ok(recovered_config.clone());
    state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &conflict,
                ResyncSource::ConfigAndTasks {
                    task_io: &FsTaskIo,
                    load_config: &loader,
                },
            )
        })
        .expect("write lease")
        .expect("same-session config and task resync");

    let recovered = state.require_session_snapshot().expect("snapshot");
    assert_eq!(recovered_config, *recovered.config());
    assert_eq!(
        ColumnName::from_lenient("Review"),
        recovered.tasks()[&CanonicalTaskPath::new("fresh.md")].status
    );
    assert_eq!(2, recovered.version().revision.as_u64());
}

#[test]
fn registry_resync_variants_replace_only_the_requested_registry() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("old-label"),
        milestones("old-milestone"),
        HashMap::new(),
    );
    let first_conflict = stale_revision_conflict(&state, &initial.identity());
    let labels_store = StubLabelStore::new(labels("disk-label"));
    let milestones_store = StubMilestoneStore {
        loaded: milestones("disk-milestone"),
    };
    state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &first_conflict,
                ResyncSource::Labels {
                    store: &labels_store,
                },
            )?;
            let after_labels = state.require_session_snapshot().expect("snapshot");
            let second_conflict = stale_revision_conflict(&state, &after_labels.identity());
            resync_if_same_project_under_lease(
                &state,
                &root,
                &second_conflict,
                ResyncSource::Milestones {
                    store: &milestones_store,
                },
            )
        })
        .expect("write lease")
        .expect("registry resync");

    let recovered = state.require_session_snapshot().expect("snapshot");
    assert_eq!(labels("disk-label"), *recovered.labels());
    assert_eq!(milestones("disk-milestone"), *recovered.milestones());
    assert_eq!(4, recovered.version().revision.as_u64());
}

#[test]
fn same_path_reopen_is_rejected_before_disk_load_and_keeps_current() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    let state = AppState::new();
    let first = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("first"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let second = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("second"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let conflict = conflict_after_switch(&state, &first.identity());
    let store = StubLabelStore::new(labels("must-not-load"));
    let error = state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &conflict,
                ResyncSource::Labels { store: &store },
            )
        })
        .expect("write lease")
        .expect_err("reopen must reject recovery");

    let ResyncError::Session(rejected) = error else {
        panic!("expected session rejection, got {error:?}");
    };
    assert_eq!(conflict, rejected);
    assert_eq!(0, store.load_calls());
    assert_same_snapshot(
        &second,
        &state.require_session_snapshot().expect("snapshot"),
    );
}

#[test]
fn cross_project_conflict_is_rejected_before_disk_load_and_keeps_current() {
    let first_dir = tempdir().expect("first temp dir");
    let second_dir = tempdir().expect("second temp dir");
    let first_root =
        ProjectRoot::from_path_buf(first_dir.path().to_path_buf()).expect("first root");
    let second_root =
        ProjectRoot::from_path_buf(second_dir.path().to_path_buf()).expect("second root");
    let state = AppState::new();
    let first = open_session(
        &state,
        first_root.clone(),
        config_with_default_status("Todo"),
        labels("first"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let second = open_session(
        &state,
        second_root,
        config_with_default_status("Todo"),
        labels("second"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let conflict = conflict_after_switch(&state, &first.identity());
    let store = StubLabelStore::new(labels("must-not-load"));
    let error = state
        .with_project_root_writer_lease(&first_root, || {
            resync_if_same_project_under_lease(
                &state,
                &first_root,
                &conflict,
                ResyncSource::Labels { store: &store },
            )
        })
        .expect("write lease")
        .expect_err("cross-project conflict must reject recovery");

    assert!(matches!(error, ResyncError::Session(_)));
    assert_eq!(0, store.load_calls());
    assert_same_snapshot(
        &second,
        &state.require_session_snapshot().expect("snapshot"),
    );
}

#[test]
fn raw_path_alias_is_rejected_as_a_different_exact_root_before_disk_load() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    let alias_path = dir
        .path()
        .join("..")
        .join(dir.path().file_name().expect("temp dir name"));
    let alias_root = ProjectRoot::from_path_buf(alias_path).expect("raw alias root");
    assert_ne!(root, alias_root);
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("resident"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let conflict = stale_revision_conflict(&state, &initial.identity());
    let before = state.require_session_snapshot().expect("snapshot");
    let store = StubLabelStore::new(labels("must-not-load"));
    let error = state
        .with_project_root_writer_lease(&alias_root, || {
            resync_if_same_project_under_lease(
                &state,
                &alias_root,
                &conflict,
                ResyncSource::Labels { store: &store },
            )
        })
        .expect("write lease")
        .expect_err("raw alias must not share an exact-root lease");

    assert!(matches!(error, ResyncError::Session(_)));
    assert_eq!(0, store.load_calls());
    assert_same_snapshot(
        &before,
        &state.require_session_snapshot().expect("snapshot"),
    );
}

#[test]
fn revision_progress_during_disk_load_wins_and_recovered_value_is_not_applied() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().to_path_buf()).expect("root");
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("initial"),
        MilestoneRegistry::default(),
        HashMap::new(),
    );
    let conflict = stale_revision_conflict(&state, &initial.identity());
    let recovery_target = state.require_session_snapshot().expect("snapshot");
    let store = RevisionAdvancingLabelStore {
        state: &state,
        expected: recovery_target.identity(),
        concurrent: labels("concurrent"),
        loaded: labels("must-not-apply"),
    };
    let error = state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &conflict,
                ResyncSource::Labels { store: &store },
            )
        })
        .expect("write lease")
        .expect_err("fresh full identity CAS must reject revision progress");

    assert!(matches!(
        error,
        ResyncError::Commit(SessionWriteError::Conflict(_))
    ));
    let current = state.require_session_snapshot().expect("snapshot");
    assert_eq!(labels("concurrent"), *current.labels());
    assert_eq!(2, current.version().revision.as_u64());
    assert_eq!(initial.version().session_id, current.version().session_id);
}

#[test]
fn config_and_task_scan_failure_leaves_every_current_aggregate_field_unchanged() {
    let dir = tempdir().expect("temp dir");
    let root = ProjectRoot::from_path_buf(dir.path().join("missing-project")).expect("root");
    let state = AppState::new();
    let initial = open_session(
        &state,
        root.clone(),
        config_with_default_status("Todo"),
        labels("resident-label"),
        milestones("resident-milestone"),
        HashMap::from([(
            CanonicalTaskPath::new("resident.md"),
            sample_task("resident.md", "Resident"),
        )]),
    );
    let conflict = stale_revision_conflict(&state, &initial.identity());
    let before = state.require_session_snapshot().expect("snapshot");
    let recovered_config = config_with_default_status("Review");
    let loader = |_root: &Path| Ok(recovered_config.clone());
    let error = state
        .with_project_root_writer_lease(&root, || {
            resync_if_same_project_under_lease(
                &state,
                &root,
                &conflict,
                ResyncSource::ConfigAndTasks {
                    task_io: &FsTaskIo,
                    load_config: &loader,
                },
            )
        })
        .expect("write lease")
        .expect_err("missing root scan must fail");

    assert!(matches!(error, ResyncError::Tasks(_)));
    assert_same_snapshot(
        &before,
        &state.require_session_snapshot().expect("snapshot"),
    );
}
