use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::CreateTaskArgs;
use super::super::error::{ContentRejectReason, CreateTaskCommandError, CreateTaskError};
use super::create_task_impl;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::SessionRevision;
use crate::state::AppState;
use crate::task::io::FsTaskIo;
use crate::task::task_index::ParentHierarchyErrorReason;
use crate::task::writer_test_support::{
    session_revision, session_write_ignore_len, CountingTaskIo,
};

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn args_with_title(title: &str) -> CreateTaskArgs {
    CreateTaskArgs {
        draft: false,
        due: None,
        file_name: None,
        title: title.into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        links: Vec::new(),
        body: None,
    }
}

#[test]
fn create_task_writes_md_and_inserts_into_cache_for_empty_project() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_with_title("Fix Login Bug");
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    assert_eq!(task.file_path, "tasks/fix-login-bug.md");
    let abs = dir.path().join("tasks/fix-login-bug.md");
    assert!(abs.exists(), "md file should be written");
    let content = fs::read_to_string(&abs).expect("read");
    assert!(content.contains("title: Fix Login Bug"));
    assert!(content.contains("status: Todo"));

    let snap = state.test_tasks_snapshot().expect("snapshot");
    assert_eq!(1, snap.len());
    assert_eq!("tasks/fix-login-bug.md", snap[0].file_path);
}

#[test]
fn create_task_with_priority_and_labels_and_body_renders_full_frontmatter() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = CreateTaskArgs {
        draft: false,
        due: None,
        file_name: None,
        title: "Implement Feature".into(),
        status: "Doing".into(),
        priority: Some("high".into()),
        milestone: None,
        labels: vec!["bug".into(), "api".into()],
        parent: None,
        links: Vec::new(),
        body: Some("Detailed description.".into()),
    };
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    let abs = dir.path().join(task.file_path.as_str());
    let content = fs::read_to_string(&abs).expect("read");
    assert!(content.contains("priority: High"));
    assert!(content.contains("- bug"));
    assert!(content.contains("- api"));
    assert!(content.contains("Detailed description."));
}

#[test]
fn create_task_under_parent_places_into_parent_dir_and_updates_children() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());

    let parent_rel = "issues/82/parent.md";
    let parent_md = "---\ntitle: Parent\nstatus: Todo\n---\n";
    let parent_abs = dir.path().join(parent_rel);
    fs::create_dir_all(parent_abs.parent().unwrap()).unwrap();
    fs::write(&parent_abs, parent_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let args = CreateTaskArgs {
        draft: false,
        due: None,
        file_name: None,
        title: "Child Task".into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: Some("issues/82/parent.md".into()),
        links: Vec::new(),
        body: None,
    };
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    assert_eq!(task.file_path, "issues/82/child-task.md");
    let abs = dir.path().join("issues/82/child-task.md");
    assert!(abs.exists());

    let snap = state.test_tasks_snapshot().expect("snapshot");
    let parent_task = snap
        .iter()
        .find(|t| t.file_path == "issues/82/parent.md")
        .expect("parent in cache");
    assert!(
        parent_task
            .children
            .iter()
            .any(|c| c.as_str() == "issues/82/child-task.md"),
        "child should be appended to parent.children",
    );
}

#[test]
fn create_task_normalizes_raw_parent_path_to_resolved_dir() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let parent_md = "---\ntitle: Parent\nstatus: Todo\n---\n";
    let parent_abs = dir.path().join("tasks/parent.md");
    fs::create_dir_all(parent_abs.parent().unwrap()).unwrap();
    fs::write(&parent_abs, parent_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let cases = vec!["./tasks/parent.md", "tasks\\parent.md"];
    for (i, raw) in cases.into_iter().enumerate() {
        let args = CreateTaskArgs {
            draft: false,
            due: None,
            file_name: None,
            title: format!("Child {i}"),
            status: "Todo".into(),
            priority: None,
            milestone: None,
            labels: Vec::new(),
            parent: Some(raw.to_string()),
            links: Vec::new(),
            body: None,
        };
        let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");
        assert!(
            task.file_path.as_str().starts_with("tasks/"),
            "raw parent {raw} should resolve to tasks/, got {}",
            task.file_path
        );
    }
}

#[test]
fn create_task_collision_appends_suffix() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    create_task_impl(&state, &FsTaskIo, args_with_title("Foo")).expect("first");
    let second = create_task_impl(&state, &FsTaskIo, args_with_title("Foo")).expect("second");

    assert_eq!(second.file_path, "tasks/foo-1.md");
}

#[test]
fn create_task_returns_no_project_open_when_project_not_opened() {
    let state = AppState::new();
    let err = create_task_impl(&state, &FsTaskIo, args_with_title("X")).expect_err("should fail");
    assert!(matches!(err, CreateTaskCommandError::NoProjectOpen));
}

#[test]
fn create_task_returns_parent_not_found_for_missing_parent() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("X");
    args.parent = Some("tasks/missing.md".into());
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentNotFound { parent }) => {
            assert_eq!("tasks/missing.md", parent);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_returns_invalid_title_for_empty_title() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("");
    args.title.clear();
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    assert!(matches!(
        err,
        CreateTaskCommandError::Validation(CreateTaskError::InvalidTitle)
    ));
}

#[test]
fn create_task_registers_session_write_ignore_and_advances_revision() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let before = session_revision(&state);

    let task = create_task_impl(&state, &FsTaskIo, args_with_title("Watched")).expect("create");
    let abs = dir.path().join(task.file_path.as_str());
    assert!(abs.exists());
    assert_eq!(1, session_write_ignore_len(&state));
    assert_eq!(
        before.as_u64() + 1,
        session_revision(&state).as_u64(),
        "one successful writer commit advances revision exactly once"
    );
}

#[test]
fn create_task_with_existing_file_returns_already_exists_and_leaves_state_clean() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let stale = dir.path().join("tasks/stale.md");
    fs::create_dir_all(stale.parent().unwrap()).unwrap();
    fs::write(&stale, "---\ntitle: Stale\nstatus: Todo\n---\n").unwrap();

    let err =
        create_task_impl(&state, &FsTaskIo, args_with_title("Stale")).expect_err("should fail");
    match err {
        CreateTaskCommandError::Io(e) => {
            assert_eq!(std::io::ErrorKind::AlreadyExists, e.kind());
        }
        other => panic!("expected Io(AlreadyExists), got {other:?}"),
    }
    assert_eq!(0, session_write_ignore_len(&state));
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_detects_augmented_too_deep_when_descendant_chain_exceeds_limit() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());

    let make = |parent: Option<&str>| {
        let mut s = String::from("---\ntitle: T\nstatus: Todo\n");
        if let Some(p) = parent {
            s.push_str(&format!("parent: {p}\n"));
        }
        s.push_str("---\n");
        s
    };
    let tasks_dir = dir.path().join("tasks");
    fs::create_dir_all(&tasks_dir).unwrap();
    fs::write(tasks_dir.join("a.md"), make(Some("tasks/new.md"))).unwrap();
    for i in 0..19 {
        let parent = format!("tasks/B{}.md", i + 1);
        fs::write(tasks_dir.join(format!("B{i}.md")), make(Some(&parent))).unwrap();
    }
    fs::write(tasks_dir.join("B19.md"), make(None)).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("New");
    args.parent = Some("tasks/B0.md".into());
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentCycleOrTooDeep {
            reason,
            ..
        }) => {
            assert_eq!(reason, ParentHierarchyErrorReason::TooDeep);
        }
        other => panic!("expected ParentCycleOrTooDeep(TooDeep), got {other:?}"),
    }
    assert!(!dir.path().join("tasks/new.md").exists());
}

#[test]
fn create_task_create_dir_all_failure_leaves_state_clean() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let tasks_path = dir.path().join("tasks");
    fs::write(&tasks_path, "stub").unwrap();

    let err = create_task_impl(&state, &FsTaskIo, args_with_title("X")).expect_err("should fail");
    assert!(matches!(err, CreateTaskCommandError::Io(_)));
    assert_eq!(0, session_write_ignore_len(&state));
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_rejects_body_larger_than_scanner_max_size() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let huge_body = "a".repeat(1024 * 1024 + 1);
    let mut args = args_with_title("Huge");
    args.body = Some(huge_body);
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        }) => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
    assert!(!dir.path().join("tasks/huge.md").exists());
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
    assert_eq!(0, session_write_ignore_len(&state));
}

#[test]
fn create_task_rejects_body_with_nul_byte_in_first_8kb() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut bad_body = String::from("hello");
    bad_body.push('\u{0000}');
    bad_body.push_str("world");
    let mut args = args_with_title("Nul");
    args.body = Some(bad_body);
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        }) => {}
        other => panic!("expected ContentNotScannerEligible(BinaryDetected), got {other:?}"),
    }
    assert!(!dir.path().join("tasks/nul.md").exists());
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
    assert_eq!(0, session_write_ignore_len(&state));
}

#[test]
fn create_task_detects_augmented_cycle_via_dangling_parent_resolution() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let a_md = "---\ntitle: A\nstatus: Todo\nparent: tasks/new.md\n---\n";
    let a_abs = dir.path().join("tasks/a.md");
    fs::create_dir_all(a_abs.parent().unwrap()).unwrap();
    fs::write(&a_abs, a_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("New");
    args.parent = Some("tasks/a.md".into());
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentCycleOrTooDeep { .. }) => {}
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
    assert!(!dir.path().join("tasks/new.md").exists());
    let snap = state.test_tasks_snapshot().unwrap();
    assert_eq!(1, snap.len());
}

// ---------------------------------------------------------------------------
// links 付き作成（書き込み / dangling 保持 / dedup / cache reverse_links 更新）
// ---------------------------------------------------------------------------

#[test]
fn create_task_with_links_writes_links_into_md() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Linker");
    args.links = vec!["tasks/a.md".into()];
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    let abs = dir.path().join(task.file_path.as_str());
    let content = fs::read_to_string(&abs).expect("read");
    assert!(content.contains("links:"));
    assert!(content.contains("- tasks/a.md"));
}

#[test]
fn create_task_without_links_omits_links_key() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task =
        create_task_impl(&state, &FsTaskIo, args_with_title("No Links")).expect("create succeeds");

    let abs = dir.path().join(task.file_path.as_str());
    let content = fs::read_to_string(&abs).expect("read");
    assert!(!content.contains("links:"), "links key must be omitted");
}

#[test]
fn create_task_keeps_dangling_link_and_succeeds() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Dangler");
    args.links = vec!["tasks/ghost.md".into()];
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds despite dangling");

    let abs = dir.path().join(task.file_path.as_str());
    let content = fs::read_to_string(&abs).expect("read");
    assert!(content.contains("- tasks/ghost.md"));
}

#[test]
fn create_task_dedups_links_before_writing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Dedup");
    args.links = vec!["./tasks/a.md".into(), "tasks/a.md".into()];
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    let abs = dir.path().join(task.file_path.as_str());
    let content = fs::read_to_string(&abs).expect("read");
    assert_eq!(
        content.matches("- tasks/a.md").count(),
        1,
        "dedup to 1 entry"
    );
}

#[test]
fn create_task_with_existing_target_updates_reverse_links_in_cache() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let target_md = "---\ntitle: Target\nstatus: Todo\n---\n";
    let target_abs = dir.path().join("tasks/target.md");
    fs::create_dir_all(target_abs.parent().unwrap()).unwrap();
    fs::write(&target_abs, target_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Source");
    args.links = vec!["tasks/target.md".into()];
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    // 返却タスクの links に target を含む。
    assert!(task.links.iter().any(|l| l.as_str() == "tasks/target.md"));

    // cache 内 target の reverse_links に作成タスク path が追加される。
    let snap = state.test_tasks_snapshot().expect("snapshot");
    let target_task = snap
        .iter()
        .find(|t| t.file_path == "tasks/target.md")
        .expect("target in cache");
    assert!(
        target_task
            .reverse_links
            .iter()
            .any(|r| r.as_str() == task.file_path.as_str()),
        "source path must be appended to target.reverse_links",
    );
}

#[test]
fn create_task_with_explicit_file_name_writes_md() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Fix Login Bug");
    args.file_name = Some("custom.md".into());
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    assert_eq!("tasks/custom.md", task.file_path.as_str());
    let abs = dir.path().join("tasks/custom.md");
    assert!(abs.exists());
    let content = fs::read_to_string(&abs).unwrap();
    assert!(content.contains("title: Fix Login Bug"));
}

#[test]
fn create_task_with_duplicate_explicit_file_name_appends_suffix() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut first = args_with_title("First");
    first.file_name = Some("custom.md".into());
    create_task_impl(&state, &FsTaskIo, first).expect("first create succeeds");
    let original = fs::read_to_string(dir.path().join("tasks/custom.md")).unwrap();

    let mut second = args_with_title("Second");
    second.file_name = Some("custom.md".into());
    let task = create_task_impl(&state, &FsTaskIo, second).expect("second create succeeds");

    assert_eq!("tasks/custom-1.md", task.file_path.as_str());
    assert!(dir.path().join("tasks/custom-1.md").exists());
    // 既存ファイルは上書きされない。
    assert_eq!(
        original,
        fs::read_to_string(dir.path().join("tasks/custom.md")).unwrap()
    );
}

#[test]
fn create_task_with_invalid_file_name_creates_nothing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Bad Name");
    args.file_name = Some("bad/name.md".into());
    let err = create_task_impl(&state, &FsTaskIo, args).expect_err("should fail");

    assert!(matches!(
        err,
        CreateTaskCommandError::Validation(CreateTaskError::InvalidFileName(_))
    ));
    assert!(state.test_tasks_snapshot().unwrap().is_empty());
    assert!(!dir.path().join("tasks").join("bad").exists());
}

#[test]
fn create_task_with_due_writes_due_into_md_and_payload() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Due Task");
    args.due = Some("2026-07-01".into());
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    let content = fs::read_to_string(dir.path().join(task.file_path.as_str())).unwrap();
    assert!(content.contains("due: 2026-07-01"));
    assert_eq!(Some("2026-07-01"), task.due.as_ref().map(|d| d.as_str()));
}

#[test]
fn create_task_without_due_omits_due_key() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task =
        create_task_impl(&state, &FsTaskIo, args_with_title("No Due Task")).expect("succeeds");

    let content = fs::read_to_string(dir.path().join(task.file_path.as_str())).unwrap();
    assert!(!content.contains("due:"));
    assert!(task.due.is_none());
}

#[test]
fn create_task_with_draft_writes_draft_into_md_and_payload() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("Draft Task");
    args.draft = true;
    let task = create_task_impl(&state, &FsTaskIo, args).expect("create succeeds");

    let content = fs::read_to_string(dir.path().join(task.file_path.as_str())).unwrap();
    assert!(content.contains("draft: true"));
    assert!(task.draft);
}

#[test]
fn create_task_without_draft_omits_draft_key() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task =
        create_task_impl(&state, &FsTaskIo, args_with_title("Normal Task")).expect("succeeds");

    let content = fs::read_to_string(dir.path().join(task.file_path.as_str())).unwrap();
    assert!(!content.contains("draft:"));
    assert!(!task.draft);
}

#[test]
fn create_task_revision_exhausted_performs_zero_task_io() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));
    let io = CountingTaskIo::default();

    let error = create_task_impl(&state, &io, args_with_title("At Max"))
        .expect_err("revision exhaustion must reject the writer");

    assert!(matches!(
        error,
        CreateTaskCommandError::RevisionExhausted(_)
    ));
    assert_eq!(0, io.calls(), "preflight must run before every TaskIo call");
    assert!(!dir.path().join("tasks/at-max.md").exists());
    assert_eq!(0, session_write_ignore_len(&state));
    assert_eq!(
        u64::MAX,
        session_revision(&state).as_u64(),
        "rejected writer must not change revision"
    );
}
