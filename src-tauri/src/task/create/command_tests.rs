use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::CreateTaskArgs;
use super::super::error::{ContentRejectReason, CreateTaskCommandError, CreateTaskError};
use super::create_task_impl;
use crate::project::open::open_project_with_factories;
use crate::state::{AppState, BoxedWatcherHandle};
use crate::task::parent_validation::ParentHierarchyErrorReason;
use spec_board_fs::watcher::handle::NoopWatcherHandle;

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    open_project_with_factories(
        state,
        path.to_str().expect("utf-8"),
        |_root| Ok::<(), crate::project::open::OpenProjectError>(()),
        |(), _state, _root, _config| Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
    )
    .expect("open should succeed");
}

fn args_with_title(title: &str) -> CreateTaskArgs {
    CreateTaskArgs {
        title: title.into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: None,
        body: None,
    }
}

#[test]
fn create_task_writes_md_and_inserts_into_cache_for_empty_project() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_with_title("Fix Login Bug");
    let task = create_task_impl(&state, args).expect("create succeeds");

    assert_eq!(task.file_path, "tasks/fix-login-bug.md");
    let abs = dir.path().join("tasks/fix-login-bug.md");
    assert!(abs.exists(), "md file should be written");
    let content = fs::read_to_string(&abs).expect("read");
    assert!(content.contains("title: Fix Login Bug"));
    assert!(content.contains("status: Todo"));

    let snap = state.tasks_snapshot().expect("snapshot");
    assert_eq!(1, snap.len());
    assert_eq!("tasks/fix-login-bug.md", snap[0].file_path);
}

#[test]
fn create_task_with_priority_and_labels_and_body_renders_full_frontmatter() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = CreateTaskArgs {
        title: "Implement Feature".into(),
        status: "Doing".into(),
        priority: Some("high".into()),
        labels: vec!["bug".into(), "api".into()],
        parent: None,
        body: Some("Detailed description.".into()),
    };
    let task = create_task_impl(&state, args).expect("create succeeds");

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
        title: "Child Task".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: Some("issues/82/parent.md".into()),
        body: None,
    };
    let task = create_task_impl(&state, args).expect("create succeeds");

    assert_eq!(task.file_path, "issues/82/child-task.md");
    let abs = dir.path().join("issues/82/child-task.md");
    assert!(abs.exists());

    let snap = state.tasks_snapshot().expect("snapshot");
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
            title: format!("Child {i}"),
            status: "Todo".into(),
            priority: None,
            labels: Vec::new(),
            parent: Some(raw.to_string()),
            body: None,
        };
        let task = create_task_impl(&state, args).expect("create succeeds");
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

    create_task_impl(&state, args_with_title("Foo")).expect("first");
    let second = create_task_impl(&state, args_with_title("Foo")).expect("second");

    assert_eq!(second.file_path, "tasks/foo-1.md");
}

#[test]
fn create_task_returns_no_project_open_when_project_not_opened() {
    let state = AppState::new();
    let err = create_task_impl(&state, args_with_title("X")).expect_err("should fail");
    assert!(matches!(err, CreateTaskCommandError::NoProjectOpen));
}

#[test]
fn create_task_returns_parent_not_found_for_missing_parent() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("X");
    args.parent = Some("tasks/missing.md".into());
    let err = create_task_impl(&state, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentNotFound { parent }) => {
            assert_eq!("tasks/missing.md", parent);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }
    assert!(state.tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_returns_invalid_title_for_empty_title() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_with_title("");
    args.title.clear();
    let err = create_task_impl(&state, args).expect_err("should fail");
    assert!(matches!(
        err,
        CreateTaskCommandError::Validation(CreateTaskError::InvalidTitle)
    ));
}

#[test]
fn create_task_succeeds_when_watcher_not_installed_and_does_not_register_write_ignore() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    state
        .set_project_path(Some(dir.path().to_path_buf()))
        .unwrap();

    let task = create_task_impl(&state, args_with_title("No Watcher")).expect("succeeds");
    let abs = dir.path().join(task.file_path.as_str());
    assert!(abs.exists());
    assert!(
        state.write_ignore().is_empty().unwrap(),
        "write_ignore must stay empty when watcher is not installed"
    );
}

#[test]
fn create_task_registers_write_ignore_when_watcher_installed_and_consumed_on_event() {
    use crate::watcher_event::handler::handle_event;
    use crate::watcher_event::AdapterContext;
    use crate::watcher_event::EmitFn;
    use spec_board_fs::watcher::core::FsEvent;
    use std::sync::Mutex;

    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let task = create_task_impl(&state, args_with_title("Watched")).expect("create");
    let abs = dir.path().join(task.file_path.as_str());

    assert_eq!(1, state.write_ignore().len().expect("len"));

    let log: Arc<Mutex<Vec<(String, serde_json::Value)>>> = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |ev, payload| {
        log_clone.lock().unwrap().push((ev.to_string(), payload));
    });
    let ctx = AdapterContext {
        root: dir.path().to_path_buf(),
        default_status: "Todo".into(),
        state: Arc::clone(&state),
        emit,
    };
    handle_event(&FsEvent::Created(abs), &ctx).expect("handle ok");

    assert!(
        log.lock().unwrap().is_empty(),
        "self-write should not emit IPC"
    );
    assert!(state.write_ignore().is_empty().unwrap());
}

#[test]
fn create_task_with_existing_file_returns_already_exists_and_leaves_state_clean() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let stale = dir.path().join("tasks/stale.md");
    fs::create_dir_all(stale.parent().unwrap()).unwrap();
    fs::write(&stale, "---\ntitle: Stale\nstatus: Todo\n---\n").unwrap();

    let err = create_task_impl(&state, args_with_title("Stale")).expect_err("should fail");
    match err {
        CreateTaskCommandError::Io(e) => {
            assert_eq!(std::io::ErrorKind::AlreadyExists, e.kind());
        }
        other => panic!("expected Io(AlreadyExists), got {other:?}"),
    }
    assert!(state.write_ignore().is_empty().unwrap());
    assert!(state.tasks_snapshot().unwrap().is_empty());
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
    let err = create_task_impl(&state, args).expect_err("should fail");
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

    let err = create_task_impl(&state, args_with_title("X")).expect_err("should fail");
    assert!(matches!(err, CreateTaskCommandError::Io(_)));
    assert!(state.write_ignore().is_empty().unwrap());
    assert!(state.tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_rejects_body_larger_than_scanner_max_size() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let huge_body = "a".repeat(1024 * 1024 + 1);
    let mut args = args_with_title("Huge");
    args.body = Some(huge_body);
    let err = create_task_impl(&state, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        }) => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }
    assert!(!dir.path().join("tasks/huge.md").exists());
    assert!(state.tasks_snapshot().unwrap().is_empty());
    assert!(state.write_ignore().is_empty().unwrap());
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
    let err = create_task_impl(&state, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        }) => {}
        other => panic!("expected ContentNotScannerEligible(BinaryDetected), got {other:?}"),
    }
    assert!(!dir.path().join("tasks/nul.md").exists());
    assert!(state.tasks_snapshot().unwrap().is_empty());
    assert!(state.write_ignore().is_empty().unwrap());
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
    let err = create_task_impl(&state, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentCycleOrTooDeep { .. }) => {}
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
    assert!(!dir.path().join("tasks/new.md").exists());
    let snap = state.tasks_snapshot().unwrap();
    assert_eq!(1, snap.len());
}
