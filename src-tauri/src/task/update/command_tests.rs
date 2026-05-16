use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::super::args::UpdateTaskArgs;
use super::super::error::{UpdateTaskCommandError, UpdateTaskError};
use super::update_task_impl;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;
use crate::task::create::error::ContentRejectReason;
use crate::task::io::FsTaskIo;
use crate::task::task_index::ParentHierarchyErrorReason;
use crate::task::warning::TaskWarningCode;

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(&state, &intent, &NoopWatcherFactory).expect("open should succeed");
}

fn seed_md(root: &Path, rel: &str, content: &str) {
    let abs = root.join(rel);
    fs::create_dir_all(abs.parent().unwrap()).unwrap();
    fs::write(&abs, content).unwrap();
}

fn args_for(rel: &str) -> UpdateTaskArgs {
    UpdateTaskArgs {
        file_path: rel.to_string(),
        title: None,
        status: None,
        priority: None,
        labels: None,
        parent: None,
        body: None,
    }
}

#[test]
fn update_status_only_writes_file_and_updates_cache() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.status = Some("Doing".into());

    let task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    assert_eq!(task.status.as_str(), "Doing");

    let content = fs::read_to_string(dir.path().join("tasks/a.md")).expect("read");
    assert!(content.contains("status: Doing"));
}

#[test]
fn update_title_keeps_file_path_unchanged() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: Old\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.title = Some("New Title".into());

    let task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    assert_eq!(task.file_path, "tasks/a.md");
    assert!(dir.path().join("tasks/a.md").exists());
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("title: New Title"));
}

#[test]
fn update_empty_title_is_accepted_and_warns_invalid_title() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: Old\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.title = Some(String::new());

    let task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    assert_eq!(task.file_path, "tasks/a.md");
    assert!(
        task.warnings
            .iter()
            .any(|w| w.code == TaskWarningCode::InvalidTitleUsedFileName),
        "expected invalidTitleUsedFileName warning, got {:?}",
        task.warnings
    );
}

#[test]
fn update_labels_replaces_existing_labels() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlabels:\n  - old\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.labels = Some(vec!["bug".into(), "api".into()]);

    let _task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("- bug"));
    assert!(content.contains("- api"));
    assert!(!content.contains("- old"));
}

#[test]
fn update_body_only_replaces_body_in_file() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nold body\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.body = Some("brand new body".into());

    let _task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("brand new body"));
    assert!(!content.contains("old body"));
}

#[test]
fn update_priority_only_writes_typed_priority() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.priority = Some("high".into());

    let _task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("priority: High"));
}

#[test]
fn update_preserves_unknown_keys_on_disk() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nassignee: alice\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.title = Some("Updated".into());

    let _task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("assignee: alice"));
}

#[test]
fn update_preserves_links_array_on_disk() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.title = Some("Updated".into());

    let _task = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    let content = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert!(content.contains("tasks/b.md"));
}

#[test]
fn update_parent_rebuilds_children_in_cache() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/p.md",
        "---\ntitle: P\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.parent = Some("tasks/p.md".into());

    let returned = update_task_impl(&state, &FsTaskIo, args).expect("ok");
    assert_eq!(returned.file_path, "tasks/a.md");

    let snap = state.tasks_snapshot().unwrap();
    let parent = snap
        .iter()
        .find(|t| t.file_path == "tasks/p.md")
        .expect("parent in cache");
    assert!(parent.children.iter().any(|c| c.as_str() == "tasks/a.md"));
}

#[test]
fn update_parent_change_removes_from_old_parent_and_adds_to_new() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/p1.md",
        "---\ntitle: P1\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/p2.md",
        "---\ntitle: P2\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nparent: tasks/p1.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.parent = Some("tasks/p2.md".into());

    let _ = update_task_impl(&state, &FsTaskIo, args).expect("ok");

    let snap = state.tasks_snapshot().unwrap();
    let p1 = snap.iter().find(|t| t.file_path == "tasks/p1.md").unwrap();
    let p2 = snap.iter().find(|t| t.file_path == "tasks/p2.md").unwrap();
    assert!(!p1.children.iter().any(|c| c.as_str() == "tasks/a.md"));
    assert!(p2.children.iter().any(|c| c.as_str() == "tasks/a.md"));
}

#[test]
fn update_parent_clear_removes_from_parent_children() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/p.md",
        "---\ntitle: P\nstatus: Todo\n---\n",
    );
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let mut args = args_for("tasks/a.md");
    args.parent = Some(String::new());

    let _ = update_task_impl(&state, &FsTaskIo, args).expect("ok");

    let snap = state.tasks_snapshot().unwrap();
    let p = snap.iter().find(|t| t.file_path == "tasks/p.md").unwrap();
    assert!(p.children.is_empty());
}

#[test]
fn update_parent_not_found_leaves_state_untouched() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let original = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();

    let mut args = args_for("tasks/a.md");
    args.parent = Some("tasks/missing.md".into());

    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    match err {
        UpdateTaskCommandError::Validation(UpdateTaskError::ParentNotFound { path }) => {
            assert_eq!("tasks/missing.md", path);
        }
        other => panic!("expected ParentNotFound, got {other:?}"),
    }

    let after = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(original, after);
    assert!(state.write_ignore().is_empty().unwrap());
}

#[test]
fn update_file_not_found_when_cache_miss() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_for("tasks/ghost.md");
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::FileNotFound(_))
    ));
}

#[test]
fn update_invalid_path_with_traversal_returns_invalid_path() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_for("../etc/passwd");
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::InvalidPath(_))
    ));
}

#[test]
fn update_invalid_path_non_md_extension_returns_invalid_path() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_for("tasks/foo.txt");
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::InvalidPath(_))
    ));
}

#[test]
fn update_invalid_path_directory_returns_invalid_path() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let args = args_for("tasks/");
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::InvalidPath(_))
    ));
}

#[test]
fn update_parse_failed_when_existing_file_has_broken_yaml() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // Replace on-disk content with broken YAML (unclosed bracket).
    fs::write(
        dir.path().join("tasks/a.md"),
        "---\ntitle: [unclosed\n---\n",
    )
    .unwrap();

    let mut args = args_for("tasks/a.md");
    args.status = Some("Doing".into());
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    match err {
        UpdateTaskCommandError::Validation(UpdateTaskError::ParseFailed(_)) => {}
        other => panic!("expected ParseFailed for broken YAML, got {other:?}"),
    }
}

#[test]
fn update_parse_failed_when_existing_file_has_no_frontmatter() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // Now corrupt the on-disk file to have no frontmatter; cache still has the task.
    fs::write(dir.path().join("tasks/a.md"), "no frontmatter here\n").unwrap();

    let mut args = args_for("tasks/a.md");
    args.status = Some("Doing".into());
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::ParseFailed(_))
    ));
}

#[test]
fn update_returns_no_project_open_when_project_not_opened() {
    let state = AppState::new();
    let args = args_for("tasks/a.md");
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(err, UpdateTaskCommandError::NoProjectOpen));
}

#[test]
fn update_body_too_large_does_not_modify_file_or_cache() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let original = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();

    let mut args = args_for("tasks/a.md");
    args.body = Some("a".repeat(1024 * 1024 + 1));
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    match err {
        UpdateTaskCommandError::Validation(UpdateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge { .. },
        }) => {}
        other => panic!("expected ContentNotScannerEligible(TooLarge), got {other:?}"),
    }

    let after = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(original, after);
    assert!(state.write_ignore().is_empty().unwrap());
}

#[test]
fn update_self_cycle_is_rejected_without_filesystem_change() {
    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let original = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();

    let mut args = args_for("tasks/a.md");
    args.parent = Some("tasks/a.md".into());
    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::ParentCycleOrTooDeep { .. })
    ));

    let after = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(original, after);
}

// 2 段 descendant cycle (a → b → a) を E2E で拒否し、
// ファイル内容 + cache snapshot の対象 task の parent/children が不変であることを確認する。
#[test]
fn update_descendant_cycle_is_rejected_without_filesystem_change() {
    let dir = tempdir();
    let root = dir.path();
    seed_md(root, "tasks/a.md", "---\ntitle: A\nstatus: Todo\n---\n");
    seed_md(
        root,
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), root);

    let before_a = fs::read_to_string(root.join("tasks/a.md")).unwrap();
    let before_b = fs::read_to_string(root.join("tasks/b.md")).unwrap();
    let before_snapshot = state.tasks_snapshot().unwrap();

    let mut args = args_for("tasks/a.md");
    args.parent = Some("tasks/b.md".into());

    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    assert!(matches!(
        err,
        UpdateTaskCommandError::Validation(UpdateTaskError::ParentCycleOrTooDeep { .. })
    ));

    assert_eq!(
        fs::read_to_string(root.join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(root.join("tasks/b.md")).unwrap(),
        before_b
    );

    let after_snapshot = state.tasks_snapshot().unwrap();
    let before_a_task = before_snapshot
        .iter()
        .find(|t| t.file_path == "tasks/a.md")
        .expect("before a");
    let after_a_task = after_snapshot
        .iter()
        .find(|t| t.file_path == "tasks/a.md")
        .expect("after a");
    assert_eq!(before_a_task.parent, after_a_task.parent);
    assert_eq!(before_a_task.children, after_a_task.children);
}

// 21 edge chain (C → B0 → ... → B20) を E2E で `TooDeep` として拒否し、
// 更新対象 C.md のファイル + cache の parent が不変であることを確認する。
#[test]
fn update_chain_too_deep_is_rejected_without_filesystem_change() {
    let dir = tempdir();
    let root = dir.path();
    // 20 edge chain: B0.parent=B1, ..., B19.parent=B20, B20.parent=None
    for i in 0..20 {
        seed_md(
            root,
            &format!("tasks/B{i}.md"),
            &format!(
                "---\ntitle: B{i}\nstatus: Todo\nparent: tasks/B{}.md\n---\n",
                i + 1
            ),
        );
    }
    seed_md(root, "tasks/B20.md", "---\ntitle: B20\nstatus: Todo\n---\n");
    seed_md(root, "tasks/C.md", "---\ntitle: C\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), root);

    let before_c = fs::read_to_string(root.join("tasks/C.md")).unwrap();
    let before_snapshot = state.tasks_snapshot().unwrap();

    // C.parent = B0 → C → B0 → ... → B20 で 21 edge → TooDeep
    let mut args = args_for("tasks/C.md");
    args.parent = Some("tasks/B0.md".into());

    let err = update_task_impl(&state, &FsTaskIo, args).expect_err("fail");
    match err {
        UpdateTaskCommandError::Validation(UpdateTaskError::ParentCycleOrTooDeep {
            reason: ParentHierarchyErrorReason::TooDeep,
            ..
        }) => {}
        other => panic!("expected ParentCycleOrTooDeep(TooDeep), got {other:?}"),
    }

    assert_eq!(
        fs::read_to_string(root.join("tasks/C.md")).unwrap(),
        before_c
    );

    let after_snapshot = state.tasks_snapshot().unwrap();
    let before_c_task = before_snapshot
        .iter()
        .find(|t| t.file_path == "tasks/C.md")
        .expect("before C");
    let after_c_task = after_snapshot
        .iter()
        .find(|t| t.file_path == "tasks/C.md")
        .expect("after C");
    assert_eq!(before_c_task.parent, after_c_task.parent);
}

#[test]
fn update_task_registers_write_ignore_and_consumes_on_modified_and_renamed_events() {
    use crate::watcher_event::handler::handle_event;
    use crate::watcher_event::AdapterContext;
    use crate::watcher_event::EmitFn;
    use spec_board_fs::watcher::core::FsEvent;
    use std::sync::Mutex;

    let dir = tempdir();
    seed_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let abs = dir.path().join("tasks/a.md");

    let log: Arc<Mutex<Vec<(String, serde_json::Value)>>> = Arc::new(Mutex::new(Vec::new()));
    let log_for_emit = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |ev, payload| {
        log_for_emit.lock().unwrap().push((ev.to_string(), payload));
    });
    let ctx = AdapterContext {
        root: dir.path().to_path_buf(),
        default_status: "Todo".into(),
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn crate::task::io::TaskIo>,
    };

    let mut args1 = args_for("tasks/a.md");
    args1.status = Some("Doing".into());
    let _t1 = update_task_impl(&state, &FsTaskIo, args1).expect("update#1 ok");
    assert_eq!(1, state.write_ignore().len().expect("len"));

    handle_event(&FsEvent::Modified(abs.clone()), &ctx).expect("handle Modified ok");
    assert!(
        log.lock().unwrap().is_empty(),
        "self-write should not emit IPC on Modified"
    );
    assert!(state.write_ignore().is_empty().unwrap());

    let mut args2 = args_for("tasks/a.md");
    args2.priority = Some("high".into());
    let _t2 = update_task_impl(&state, &FsTaskIo, args2).expect("update#2 ok");
    assert_eq!(1, state.write_ignore().len().expect("len"));

    let tmp = abs.with_extension("md.tmp.0");
    handle_event(
        &FsEvent::Renamed {
            from: tmp,
            to: abs.clone(),
        },
        &ctx,
    )
    .expect("handle Renamed ok");
    assert!(
        log.lock().unwrap().is_empty(),
        "self-write should not emit IPC on Renamed(tmp -> abs)"
    );
    assert!(state.write_ignore().is_empty().unwrap());
}
