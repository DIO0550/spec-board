use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tempfile::TempDir;

use super::super::frontmatter::Priority;
use super::super::index::{TaskExtras, TaskWarning};
use super::*;
use crate::project::open::open_project_with_factories;
use crate::state::{AppState, BoxedWatcherHandle};
use spec_board_fs::watcher::handle::NoopWatcherHandle;

fn set_of(items: &[&str]) -> HashSet<String> {
    items.iter().map(|s| (*s).to_string()).collect()
}

fn make_task(file_path: &str, parent: Option<&str>) -> Task {
    Task {
        id: file_path.into(),
        file_path: file_path.into(),
        title: "Task".into(),
        status: "Todo".into(),
        priority: None::<Priority>,
        labels: Vec::new(),
        parent: parent.map(Into::into),
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: TaskExtras::new(),
        warnings: Vec::<TaskWarning>::new(),
    }
}

fn task_with_parent(file_path: &str, parent: &str) -> Task {
    make_task(file_path, Some(parent))
}

fn task_without_parent(file_path: &str) -> Task {
    make_task(file_path, None)
}

/// 新規タスク → 起点 parent (`tasks/0.md`) → ... → root (`tasks/{edge_count}.md`) の
/// chain を表す Task 一覧を作る。`tasks[0]` が新規タスクの parent 候補。
/// 戻り値の長さは `edge_count + 1`、parent 側 edge 数は `edge_count`。
fn parent_chain_with_edge_count(edge_count: usize) -> Vec<Task> {
    let mut tasks = Vec::with_capacity(edge_count + 1);
    for index in 0..edge_count {
        tasks.push(task_with_parent(
            &format!("tasks/{index}.md"),
            &format!("tasks/{}.md", index + 1),
        ));
    }
    tasks.push(task_without_parent(&format!("tasks/{edge_count}.md")));
    tasks
}

#[test]
fn build_new_filename_ascii_no_collision_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        (
            "Fix Login Bug",
            vec![],
            "fix-login-bug.md",
            "ascii basic / empty existing",
        ),
        (
            "Refactor API",
            vec!["other.md"],
            "refactor-api.md",
            "ascii basic / non-colliding existing",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_ascii_collision_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        (
            "Fix Login Bug",
            vec!["fix-login-bug.md"],
            "fix-login-bug-1.md",
            "single collision",
        ),
        (
            "x",
            vec!["x.md", "x-1.md", "x-2.md"],
            "x-3.md",
            "consecutive collisions",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_non_ascii_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        ("バグ修正", vec![], "バグ修正.md", "pure CJK / no collision"),
        (
            "タスク",
            vec!["タスク.md"],
            "タスク-1.md",
            "pure CJK / single collision",
        ),
        (
            "タスク",
            vec!["タスク.md", "タスク-1.md"],
            "タスク-2.md",
            "pure CJK / consecutive collisions",
        ),
        (
            "タスク 1",
            vec!["タスク-1.md"],
            "タスク-1-1.md",
            "mixed CJK + ASCII / numeric suffix base collision",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_invalid_title_cases() {
    let cases: Vec<(&str, &str)> = vec![
        ("", "empty title"),
        ("   ", "ASCII whitespace only"),
        ("!!!", "symbols only (kebab result empty)"),
    ];
    for (title, label) in cases {
        let existing: HashSet<String> = HashSet::new();
        let actual = build_new_filename(title, &existing);
        assert_eq!(actual, Err(CreateTaskError::InvalidTitle), "{label}");
    }
}

#[test]
fn validate_parent_for_new_task_ok_cases() {
    let single = vec![task_without_parent("tasks/a.md")];
    let chain_19 = parent_chain_with_edge_count(19);

    let cases: Vec<(Option<&str>, &[Task], &str)> = vec![
        (None, &[], "parent=None / empty existing"),
        (None, single.as_slice(), "parent=None / non-empty existing"),
        (
            Some("tasks/a.md"),
            single.as_slice(),
            "existing root parent",
        ),
        (
            Some("./tasks/a.md"),
            single.as_slice(),
            "leading ./ normalized",
        ),
        (
            Some("tasks\\a.md"),
            single.as_slice(),
            "backslash separator",
        ),
        (
            Some("tasks/0.md"),
            chain_19.as_slice(),
            "edge 19 chain (total 20 = MAX)",
        ),
    ];
    for (parent, tasks, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(parent, tasks),
            Ok(()),
            "{label}"
        );
    }
}

#[test]
fn validate_parent_for_new_task_not_found_cases() {
    let single = vec![task_without_parent("tasks/a.md")];

    let cases: Vec<(&str, &[Task], &str)> = vec![
        ("tasks/missing.md", single.as_slice(), "no matching path"),
        ("", single.as_slice(), "empty parent string"),
        ("/abs/path.md", single.as_slice(), "absolute path"),
        ("C:\\foo.md", single.as_slice(), "windows drive prefix"),
        (
            "tasks/self.md",
            single.as_slice(),
            "self reference (new task not yet registered)",
        ),
        ("tasks/a.md", &[] as &[Task], "empty existing tasks"),
    ];
    for (parent, tasks, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(Some(parent), tasks),
            Err(CreateTaskError::ParentNotFound {
                parent: parent.to_string(),
            }),
            "{label}"
        );
    }
}

#[test]
fn validate_parent_for_new_task_cycle_or_too_deep_cases() {
    let chain_20 = parent_chain_with_edge_count(20);
    let cycle_pair = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let cases: Vec<(&str, &[Task], ParentHierarchyErrorReason, &str)> = vec![
        (
            "tasks/0.md",
            chain_20.as_slice(),
            ParentHierarchyErrorReason::TooDeep,
            "edge 20 chain (total 21 exceeds MAX)",
        ),
        (
            "tasks/a.md",
            cycle_pair.as_slice(),
            ParentHierarchyErrorReason::Cycle,
            "two-node cycle a <-> b",
        ),
    ];
    for (parent, tasks, expected_reason, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(Some(parent), tasks),
            Err(CreateTaskError::ParentCycleOrTooDeep {
                parent: parent.to_string(),
                reason: expected_reason,
            }),
            "{label}"
        );
    }
}

// ============================================================================
// Pure helpers: resolve_target_dir / build_existing_filenames_in_dir / build_task_content
// ============================================================================

#[test]
fn resolve_target_dir_returns_tasks_when_parent_none() {
    let snapshot: Vec<Task> = Vec::new();
    assert_eq!(PathBuf::from("tasks"), resolve_target_dir(None, &snapshot));
}

#[test]
fn resolve_target_dir_returns_tasks_when_parent_in_tasks_dir() {
    let snapshot = vec![task_without_parent("tasks/parent.md")];
    assert_eq!(
        PathBuf::from("tasks"),
        resolve_target_dir(Some(0), &snapshot)
    );
}

#[test]
fn resolve_target_dir_returns_parent_dirname_for_nested_parent() {
    let snapshot = vec![task_without_parent("issues/82/parent.md")];
    assert_eq!(
        PathBuf::from("issues/82"),
        resolve_target_dir(Some(0), &snapshot)
    );
}

#[test]
fn build_existing_filenames_collects_only_files_in_target_dir() {
    let snapshot = vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("tasks/b.md"),
        task_without_parent("issues/x.md"),
    ];
    let names = build_existing_filenames_in_dir(&snapshot, Path::new("tasks"));
    assert_eq!(set_of(&["a.md", "b.md"]), names);
}

#[test]
fn build_existing_filenames_excludes_other_directories() {
    let snapshot = vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("notes/a.md"),
    ];
    let names = build_existing_filenames_in_dir(&snapshot, Path::new("notes"));
    assert_eq!(set_of(&["a.md"]), names);
}

#[test]
fn build_task_content_renders_title_and_status_in_fixed_order() {
    let args = CreateTaskArgs {
        title: "Foo Bar".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: None,
        body: None,
    };
    let content = build_task_content(&args, None);
    assert!(content.starts_with("---\ntitle: Foo Bar\nstatus: Todo\n"));
    // priority / labels / parent / links は省略
    assert!(!content.contains("priority:"));
    assert!(!content.contains("labels:"));
    assert!(!content.contains("parent:"));
}

#[test]
fn build_task_content_normalizes_priority_case_insensitively() {
    let cases: Vec<(&str, &str)> = vec![("high", "High"), ("HIGH", "High"), ("MeDiUm", "Medium")];
    for (input, expected) in cases {
        let args = CreateTaskArgs {
            title: "T".into(),
            status: "Todo".into(),
            priority: Some(input.to_string()),
            labels: Vec::new(),
            parent: None,
            body: None,
        };
        let content = build_task_content(&args, None);
        assert!(
            content.contains(&format!("priority: {expected}")),
            "priority {input} → {expected} expected, got:\n{content}"
        );
    }
}

#[test]
fn build_task_content_omits_priority_for_invalid_string() {
    let args = CreateTaskArgs {
        title: "T".into(),
        status: "Todo".into(),
        priority: Some("urgent".into()),
        labels: Vec::new(),
        parent: None,
        body: None,
    };
    let content = build_task_content(&args, None);
    assert!(
        !content.contains("priority:"),
        "invalid priority should be omitted, got:\n{content}"
    );
}

#[test]
fn build_task_content_renders_labels_and_parent_and_body() {
    let args = CreateTaskArgs {
        title: "T".into(),
        status: "Todo".into(),
        priority: Some("High".into()),
        labels: vec!["bug".into(), "api".into()],
        parent: Some("tasks/p.md".into()),
        body: Some("hello body".into()),
    };
    let content = build_task_content(&args, Some("tasks/p.md"));
    assert!(content.contains("title: T"));
    assert!(content.contains("status: Todo"));
    assert!(content.contains("priority: High"));
    assert!(content.contains("labels:"));
    assert!(content.contains("- bug"));
    assert!(content.contains("- api"));
    assert!(content.contains("parent: tasks/p.md"));
    assert!(
        content.ends_with("hello body\n"),
        "body trailing:\n{content}"
    );
}

// ============================================================================
// Effect layer: create_task_impl integration tests
// ============================================================================

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

    // 事前に親 task を直接書き込んで open する。
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

    // 親 children 更新確認
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
    // cache / FS が不変
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
    // open は state を最低限初期化するだけ。watcher を install しない。
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

    // create 後は write_ignore に 1 件登録されているはず（NoopWatcherHandle 経由でも install 済み判定）。
    assert_eq!(1, state.write_ignore().len().expect("len"));

    // 自前 write 由来の Created event を流し、emit が抑止され write_ignore も空になることを確認する。
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

    // cache 未反映の stale ファイルを直接配置する。
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
    // write_ignore は巻き戻されて空、cache は空のまま。
    assert!(state.write_ignore().is_empty().unwrap());
    assert!(state.tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_detects_augmented_too_deep_when_descendant_chain_exceeds_limit() {
    // 既存タスクが個別では MAX 以下だが、新規 task の追加で dangling parent が
    // 解決されて累計 chain が MAX を超えるケースを検証する。
    //
    // 構成:
    //   tasks/a.md → parent: tasks/new.md (dangling)
    //   tasks/B0.md → tasks/B1.md → ... → tasks/B19.md (19 edges, B19 が root)
    //   新規: tasks/new.md → parent: tasks/B0.md
    // → 追加後の augmented chain (from tasks/a.md):
    //   a → new → B0 → B1 → ... → B19 = 21 edges = TooDeep
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
    // B0.md → B1.md → ... → B19.md, B19 が root（19 edge）
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
    // create_dir_all は親 dir が file の場合に失敗する。
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // tasks/ をファイルとして作る → create_dir_all が失敗する。
    let tasks_path = dir.path().join("tasks");
    fs::write(&tasks_path, "stub").unwrap();

    let err = create_task_impl(&state, args_with_title("X")).expect_err("should fail");
    assert!(matches!(err, CreateTaskCommandError::Io(_)));
    // register / write どちらも未実行で state は不変。
    assert!(state.write_ignore().is_empty().unwrap());
    assert!(state.tasks_snapshot().unwrap().is_empty());
}

#[test]
fn create_task_rejects_body_larger_than_scanner_max_size() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // 1 MiB を確実に超える body を生成する。
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
    // FS / state 不変
    assert!(!dir.path().join("tasks/huge.md").exists());
    assert!(state.tasks_snapshot().unwrap().is_empty());
    assert!(state.write_ignore().is_empty().unwrap());
}

#[test]
fn create_task_rejects_body_with_nul_byte_in_first_8kb() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // 先頭 8 KiB 範囲に NUL byte を含む body を生成する。
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
    // 既存 a.md は parent: tasks/new.md（dangling）。new.md は未存在。
    let a_md = "---\ntitle: A\nstatus: Todo\nparent: tasks/new.md\n---\n";
    let a_abs = dir.path().join("tasks/a.md");
    fs::create_dir_all(a_abs.parent().unwrap()).unwrap();
    fs::write(&a_abs, a_md).unwrap();
    open_with_noop(Arc::clone(&state), dir.path());

    // 新規 tasks/new.md を parent=tasks/a.md で作る → 解決後 a -> new -> a の cycle。
    let mut args = args_with_title("New");
    args.parent = Some("tasks/a.md".into());
    let err = create_task_impl(&state, args).expect_err("should fail");
    match err {
        CreateTaskCommandError::Validation(CreateTaskError::ParentCycleOrTooDeep { .. }) => {}
        other => panic!("expected ParentCycleOrTooDeep, got {other:?}"),
    }
    // FS / state 不変（a.md だけが残っている、new.md は書かれていない）。
    assert!(!dir.path().join("tasks/new.md").exists());
    let snap = state.tasks_snapshot().unwrap();
    assert_eq!(1, snap.len());
}
