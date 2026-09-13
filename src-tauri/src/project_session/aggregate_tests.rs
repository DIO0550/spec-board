use std::cell::Cell;
use std::path::PathBuf;

use crate::config::column_name::ColumnName;
use crate::config::{Config, LabelRegistry, MilestoneRegistry};
use crate::project::load_warning::ProjectLoadWarning;
use crate::project::project_root::ProjectRoot;
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::task_catalog::TaskCatalog;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{ParsedTaskBuilder, Task};

use super::{
    PreparedProjectSession, ProjectSessionCommitError, ProjectSessionStateError, ProjectState,
};
use crate::project_session::{RevisionExhausted, SessionId, SessionRevision};

#[test]
fn idle_state_rejects_snapshot_as_no_project_open() {
    let state = ProjectState::Idle;

    let error = state.snapshot().expect_err("idle must reject snapshot");

    assert_eq!(ProjectSessionStateError::NoProjectOpen, error);
}

#[test]
fn loaded_state_returns_all_domain_values_from_one_snapshot() {
    let root = ProjectRoot::try_from_str("/tmp/spec-board/project-a").expect("valid root");
    let config = Config::default();
    let labels = LabelRegistry::default();
    let milestones = MilestoneRegistry::default();
    let task = crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(
            b"---\ntitle: Aggregate task\nstatus: Todo\n---\nbody\n",
            &TaskParseContext {
                file_path: PathBuf::from("tasks/aggregate.md"),
                default_status: ColumnName::from_lenient("Todo"),
            },
        )
        .expect("valid task"),
    );
    let tasks = crate::task::task_catalog::TaskCatalog::from_tasks_for_test([task]);
    let state = ProjectState::Loaded(
        PreparedProjectSession::new(
            root.clone(),
            config.clone(),
            labels.clone(),
            milestones.clone(),
            tasks.clone(),
        )
        .into_session(SessionId::from_raw(41)),
    );

    let snapshot = state.snapshot().expect("loaded snapshot");

    assert_eq!(root, *snapshot.project_root());
    assert_eq!(config, *snapshot.config());
    assert_eq!(labels, *snapshot.labels());
    assert_eq!(milestones, *snapshot.milestones());
    assert_eq!(tasks, *snapshot.tasks());
    assert_eq!(41, snapshot.version().session_id.as_u64());
    assert_eq!(SessionRevision::INITIAL, snapshot.version().revision);
}

#[test]
fn prepared_sessions_keep_the_assigned_unique_id_and_initial_revision() {
    let first = prepared_session(101).snapshot();
    let second = prepared_session(102).snapshot();

    assert_ne!(first.version().session_id, second.version().session_id);
    assert_eq!(SessionRevision::INITIAL, first.version().revision);
    assert_eq!(SessionRevision::INITIAL, second.version().revision);
}

#[test]
fn successful_commits_increment_revision_within_the_same_session() {
    let mut session = prepared_session(101);
    let initial = session.snapshot().identity();

    let first = session
        .commit(&initial, |_| "first")
        .expect("first commit must succeed");
    let second = session
        .commit(first.identity(), |_| "second")
        .expect("second commit must succeed");

    assert_eq!("first", first.value);
    assert_eq!(1, first.identity().version().revision.as_u64());
    assert_eq!("second", second.value);
    assert_eq!(2, second.identity().version().revision.as_u64());
    assert_eq!(
        first.identity().version().session_id,
        second.identity().version().session_id
    );
}

#[test]
fn commit_at_max_revision_does_not_apply_or_change_domain_state() {
    let mut session = prepared_session_at_revision(101, SessionRevision::from_raw(u64::MAX));
    let before = session.snapshot();
    let applied = Cell::new(false);

    let error = session
        .commit(&before.identity(), |_| applied.set(true))
        .expect_err("MAX revision must reject commit");

    assert_eq!(
        ProjectSessionCommitError::RevisionExhausted(RevisionExhausted),
        error
    );
    assert!(!applied.get());
    assert_same_snapshot(&before, &session.snapshot());
}

#[test]
fn commit_rejects_different_session_id_without_applying() {
    let expected = prepared_session(100).snapshot().identity();
    let mut current = prepared_session(101);
    let before = current.snapshot();
    let applied = Cell::new(false);

    let error = current
        .commit(&expected, |_| applied.set(true))
        .expect_err("different session ID must conflict");

    let ProjectSessionCommitError::Conflict(conflict) = error else {
        panic!("expected session conflict");
    };
    assert_eq!(expected, conflict.expected);
    assert_eq!(Some(before.identity()), conflict.actual);
    assert_eq!(
        conflict,
        before
            .ensure_identity(&expected)
            .expect_err("snapshot must report the same conflict")
    );
    before
        .ensure_identity(&before.identity())
        .expect("current snapshot identity must match");
    assert!(!applied.get());
    assert_same_snapshot(&before, &current.snapshot());
}

#[test]
fn commit_rejects_stale_revision_without_applying() {
    let mut current = prepared_session(101);
    let stale = current.snapshot().identity();
    current
        .commit(&stale, |_| ())
        .expect("initial commit must advance revision");
    let before = current.snapshot();
    let applied = Cell::new(false);

    let error = current
        .commit(&stale, |_| applied.set(true))
        .expect_err("stale revision must conflict");

    let ProjectSessionCommitError::Conflict(conflict) = error else {
        panic!("expected revision conflict");
    };
    assert_eq!(stale, conflict.expected);
    assert_eq!(Some(before.identity()), conflict.actual);
    assert!(!applied.get());
    assert_same_snapshot(&before, &current.snapshot());
}

#[test]
fn idle_state_commit_returns_conflict_without_applying() {
    let expected = prepared_session(101).identity();
    let mut state = ProjectState::Idle;
    let applied = Cell::new(false);

    let error = state
        .commit(&expected, |_| applied.set(true))
        .expect_err("idle state must conflict");

    let ProjectSessionCommitError::Conflict(conflict) = error else {
        panic!("expected session conflict");
    };
    assert_eq!(expected, conflict.expected);
    assert_eq!(None, conflict.actual);
    assert!(!applied.get());
    assert_eq!(None, state.active_identity());
}

#[test]
fn same_session_check_allows_revision_progress_but_rejects_reopen() {
    let mut current = prepared_session(101);
    let target = current.identity();
    current
        .commit(&target, |_| ())
        .expect("revision advances in the same session");
    let advanced = current.snapshot();

    advanced
        .ensure_same_session(&target)
        .expect("revision progress must not reject a queued writer");

    let reopened = prepared_session(102).snapshot();
    let conflict = reopened
        .ensure_same_session(&target)
        .expect_err("new SessionId must reject the stale target");
    assert_eq!(target, conflict.expected);
    assert_eq!(Some(reopened.identity()), conflict.actual);
}

#[test]
fn into_prepared_keeps_domain_data_and_restarts_revision_from_initial() {
    let mut session = PreparedProjectSession::new_with_warnings(
        ProjectRoot::try_from_str("/tmp/spec-board/project-a").expect("valid root"),
        Config::default(),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        crate::task::task_catalog::TaskCatalog::from_tasks_for_test([sample_task()]),
        vec![ProjectLoadWarning::config_fallback(
            "broken config".to_string(),
        )],
    )
    .into_session(SessionId::from_raw(101));
    let initial = session.identity();
    session
        .commit(&initial, |_| ())
        .expect("commit advances revision away from INITIAL");
    let before = session.snapshot();
    assert_eq!(before.config(), session.config());

    let after = session
        .into_prepared()
        .into_session(SessionId::from_raw(202))
        .snapshot();

    assert_eq!(before.project_root(), after.project_root());
    assert_eq!(before.config(), after.config());
    assert_eq!(before.labels(), after.labels());
    assert_eq!(before.milestones(), after.milestones());
    assert_eq!(before.tasks(), after.tasks());
    assert_eq!(before.load_warnings(), after.load_warnings());
    assert_eq!(202, after.version().session_id.as_u64());
    assert_eq!(SessionRevision::INITIAL, after.version().revision);
}

#[test]
fn replace_tasks_swaps_the_resident_catalog_for_the_committed_one() {
    let mut session = prepared_session(301);
    let identity = session.identity();
    let next = TaskCatalog::resolve(vec![
        ParsedTaskBuilder::new("tasks/parent.md").build(),
        ParsedTaskBuilder::new("tasks/child.md")
            .parent(Some(TaskFilePath::from("tasks/parent.md")))
            .build(),
    ])
    .expect("fixture candidates resolve")
    .catalog;
    assert!(session.snapshot().tasks().is_empty());

    session
        .commit(&identity, |session| session.replace_tasks(next.clone()))
        .expect("commit succeeds");

    let snapshot = session.snapshot();
    assert_eq!(&next, snapshot.tasks());
    assert_eq!(
        snapshot
            .tasks()
            .get(&CanonicalTaskPath::new("tasks/parent.md"))
            .expect("parent is resident")
            .children(),
        &[TaskFilePath::from("tasks/child.md")]
    );
}

#[test]
fn into_prepared_moves_the_catalog_without_re_resolving_it() {
    let catalog = TaskCatalog::resolve(vec![
        ParsedTaskBuilder::new("tasks/b.md")
            .parent(Some(TaskFilePath::from("tasks/a.md")))
            .build(),
        ParsedTaskBuilder::new("tasks/a.md").build(),
    ])
    .expect("fixture candidates resolve")
    .catalog;
    let session = PreparedProjectSession::new(
        ProjectRoot::try_from_str("/tmp/spec-board/project-a").expect("valid root"),
        Config::default(),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        catalog.clone(),
    )
    .into_session(SessionId::from_raw(401));

    let reactivated = session
        .into_prepared()
        .into_session(SessionId::from_raw(402))
        .snapshot();

    assert_eq!(&catalog, reactivated.tasks());
    let paths: Vec<_> = reactivated
        .tasks()
        .iter()
        .map(|task| task.file_path().as_str())
        .collect();
    assert_eq!(paths, vec!["tasks/a.md", "tasks/b.md"]);
}

fn sample_task() -> Task {
    crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(
            b"---\ntitle: Aggregate task\nstatus: Todo\n---\nbody\n",
            &TaskParseContext {
                file_path: PathBuf::from("tasks/aggregate.md"),
                default_status: ColumnName::from_lenient("Todo"),
            },
        )
        .expect("valid task"),
    )
}

fn assert_same_snapshot(
    expected: &super::ProjectSessionSnapshot,
    actual: &super::ProjectSessionSnapshot,
) {
    assert_eq!(expected.version(), actual.version());
    assert_eq!(expected.project_root(), actual.project_root());
    assert_eq!(expected.config(), actual.config());
    assert_eq!(expected.labels(), actual.labels());
    assert_eq!(expected.milestones(), actual.milestones());
    assert_eq!(expected.tasks(), actual.tasks());
}

fn prepared_session_at_revision(
    session_id: u64,
    revision: SessionRevision,
) -> super::ProjectSession {
    let mut session = prepared_session(session_id);
    session.revision = revision;
    session
}

fn prepared_session(session_id: u64) -> super::ProjectSession {
    PreparedProjectSession::new(
        ProjectRoot::try_from_str("/tmp/spec-board/project-a").expect("valid root"),
        Config::default(),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        crate::task::task_catalog::TaskCatalog::default(),
    )
    .into_session(SessionId::from_raw(session_id))
}
