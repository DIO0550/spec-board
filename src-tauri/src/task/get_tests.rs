use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::*;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;

fn open_with_noop(state: Arc<AppState>, path: &str) {
    let intent = OpenProjectIntent::try_from(path.to_string()).expect("non-empty path");
    open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn write_md(root: &Path, rel: &str, body: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(&absolute, body).expect("write md");
}

fn task_md(title: &str, status: &str, parent: Option<&str>) -> String {
    task_md_with_links(title, status, parent, &[])
}

fn task_md_with_milestone(title: &str, status: &str, milestone: &str) -> String {
    format!("---\ntitle: {title}\nstatus: {status}\nmilestone: \"{milestone}\"\n---\n\nbody\n")
}

fn task_md_with_links(title: &str, status: &str, parent: Option<&str>, links: &[&str]) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("title: {title}\n"));
    s.push_str(&format!("status: {status}\n"));
    if let Some(p) = parent {
        s.push_str(&format!("parent: {p}\n"));
    }
    if !links.is_empty() {
        let joined = links
            .iter()
            .map(|l| format!("\"{l}\""))
            .collect::<Vec<_>>()
            .join(", ");
        s.push_str(&format!("links: [{joined}]\n"));
    }
    s.push_str("---\n\nbody\n");
    s
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let converted: GetTasksError = AppStateError::LockPoisoned.into();
    assert_eq!(GetTasksError::StateLockPoisoned, converted);
}

#[test]
fn state_lock_poisoned_display_matches_open_project_contract() {
    assert_eq!(
        "内部状態のロックが破損しました",
        GetTasksError::StateLockPoisoned.to_string()
    );
}

#[test]
fn poisoned_tasks_cache_still_returns_state_lock_poisoned() {
    let state = Arc::new(AppState::new());
    let poison_target = Arc::clone(&state);
    let join = std::thread::spawn(move || {
        let _ = poison_target.test_update_tasks(|_| panic!("poison tasks_cache"));
    })
    .join();
    assert!(join.is_err());

    let error = get_tasks_impl(&state).expect_err("poisoned state should fail");

    assert_eq!(error, GetTasksError::StateLockPoisoned);
}

fn write_config_json(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("config.json"), content).expect("write config.json");
}

#[test]
fn returns_empty_payload_when_app_state_is_uninitialized() {
    let state = AppState::new();

    let payload = get_tasks_impl(&state).expect("should succeed even before open_project");

    assert!(payload.tasks.is_empty());
    assert!(payload.projections.is_empty());
    assert!(payload.milestone_projections.is_empty());
    let value = serde_json::to_value(&payload).expect("payload serializable");
    assert_eq!(value["milestoneProjections"], serde_json::json!({}));
}

#[test]
fn returns_tasks_sorted_by_id_after_open_project() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/a.md", "tasks/b.md"], ids);
}

// ───────── projection の同梱 ─────────

/// 3 カラム構成 + 親子 3 件（親 1 / 子 2、子の 1 件が Done）のプロジェクトを用意する。
fn open_project_with_hierarchy(state: Arc<AppState>, dir: &TempDir) {
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo",  "order": 0 },
            { "name": "Doing", "order": 1 },
            { "name": "Done",  "order": 2 }
        ],
        "cardOrder": {},
        "doneColumn": "Done"
    }"#;
    write_config_json(dir.path(), config_json);
    write_md(dir.path(), "tasks/p.md", &task_md("P", "Todo", None));
    write_md(
        dir.path(),
        "tasks/c1.md",
        &task_md("C1", "Done", Some("tasks/p.md")),
    );
    write_md(
        dir.path(),
        "tasks/c2.md",
        &task_md("C2", "Doing", Some("tasks/p.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(state, &raw);
}

#[test]
fn payload_has_a_projection_for_every_task() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    open_project_with_hierarchy(Arc::clone(&state), &dir);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(payload.projections.len(), payload.tasks.len());
}

#[test]
fn parent_projection_counts_descendants_and_done_children() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    open_project_with_hierarchy(Arc::clone(&state), &dir);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    let parent = &payload.projections["tasks/p.md"];
    assert_eq!(parent.sub_issue_progress.total, 2);
    assert_eq!(parent.sub_issue_progress.done, 1);
    assert_eq!(
        parent
            .child_file_paths
            .iter()
            .map(|p| p.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/c1.md", "tasks/c2.md"]
    );
}

#[test]
fn task_in_done_column_is_marked_done() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    open_project_with_hierarchy(Arc::clone(&state), &dir);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.projections["tasks/c1.md"].is_done);
    assert!(!payload.projections["tasks/c2.md"].is_done);
    assert!(!payload.projections["tasks/p.md"].is_done);
}

#[test]
fn milestone_projection_paths_follow_the_same_board_order_and_snapshot_as_tasks() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
  "version": 1,
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "Done", "order": 1 }
  ],
  "cardOrder": {
    "Todo": ["tasks/e.md", "tasks/c.md", "tasks/a.md", "tasks/d.md"],
    "Done": ["tasks/b.md"]
  },
  "doneColumn": "Done"
}"#,
    );
    for (name, status) in [
        ("a", "Todo"),
        ("b", "Done"),
        ("c", "Todo"),
        ("d", "Todo"),
        ("e", "Todo"),
    ] {
        write_md(
            dir.path(),
            &format!("tasks/{name}.md"),
            &task_md_with_milestone(name, status, "v1"),
        );
    }
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");
    let task_paths: Vec<&str> = payload
        .tasks
        .iter()
        .map(|task| task.file_path.as_str())
        .collect();
    let milestone = payload
        .milestone_projections
        .get("v1")
        .expect("v1 projection");
    let milestone_paths: Vec<&str> = milestone
        .task_file_paths
        .iter()
        .map(|path| path.as_str())
        .collect();

    assert_eq!(
        task_paths,
        vec![
            "tasks/e.md",
            "tasks/c.md",
            "tasks/a.md",
            "tasks/d.md",
            "tasks/b.md"
        ]
    );
    assert_eq!(milestone_paths, task_paths);
    assert_eq!(milestone.total, payload.tasks.len());
    assert_eq!(milestone.done, 1);
    assert!(payload
        .tasks
        .iter()
        .all(|task| payload.projections.contains_key(task.file_path.as_str())));
    assert_eq!(
        dir.path().to_string_lossy().as_ref(),
        payload.session.project_key.as_str()
    );
    assert_eq!(payload.session.generation, state.test_project_generation());
    assert_eq!(payload.session.revision, state.test_tasks_revision());
}

#[test]
fn clearing_config_transitions_reader_to_a_coherent_idle_payload() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_milestone("A", "Done", "v1"),
    );
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));
    state.test_replace_config(None).expect("config writable");

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.tasks.is_empty());
    assert!(payload.projections.is_empty());
    assert!(payload.milestone_projections.is_empty());
    assert_eq!("", payload.session.project_key.as_str());
    assert_eq!(0, payload.session.generation.as_u64());
    assert_eq!(0, payload.session.revision.as_u64());
    assert_eq!(0, payload.session.event_seq.as_u64());
}

// ───────── 完了カラムの解決 ─────────

#[test]
fn without_done_column_setting_the_last_column_resolves_as_done() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo",     "order": 0 },
            { "name": "Doing",    "order": 1 },
            { "name": "Complete", "order": 2 }
        ],
        "cardOrder": {}
    }"#;
    write_config_json(dir.path(), config_json);
    write_md(dir.path(), "tasks/p.md", &task_md("P", "Todo", None));
    write_md(
        dir.path(),
        "tasks/c.md",
        &task_md("C", "Complete", Some("tasks/p.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.projections["tasks/c.md"].is_done);
    assert_eq!(payload.projections["tasks/p.md"].sub_issue_progress.done, 1);
}

/// `doneColumn` に columns へ存在しない名前を設定した場合の現行契約を固定する。
///
/// `Config::resolved_done_column()` は `done_column` が `Some` なら columns に
/// 存在するか検証せずその値をそのまま返すため、`status == "Archived"` の task が
/// 完了扱いになり、末尾カラム `Complete` へはフォールバックしない。現行 resolver の
/// 完全一致挙動を維持する判断であり、不正名を unresolved 扱いに変える設計は採らない。
#[test]
fn done_column_pointing_outside_columns_matches_that_status_verbatim() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo",     "order": 0 },
            { "name": "Doing",    "order": 1 },
            { "name": "Complete", "order": 2 }
        ],
        "cardOrder": {},
        "doneColumn": "Archived"
    }"#;
    write_config_json(dir.path(), config_json);
    write_md(dir.path(), "tasks/p.md", &task_md("P", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Archived", Some("tasks/p.md")),
    );
    write_md(
        dir.path(),
        "tasks/c.md",
        &task_md("C", "Complete", Some("tasks/p.md")),
    );
    write_md(
        dir.path(),
        "tasks/d.md",
        &task_md("D", "Doing", Some("tasks/p.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.projections["tasks/a.md"].is_done);
    assert!(!payload.projections["tasks/c.md"].is_done);
    assert!(!payload.projections["tasks/d.md"].is_done);
    assert!(!payload.projections["tasks/p.md"].is_done);
    assert_eq!(payload.projections["tasks/p.md"].sub_issue_progress.done, 1);
}

#[test]
fn preserves_children_and_reverse_links_built_by_open_project() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_links("A", "Todo", Some("tasks/b.md"), &["tasks/b.md"]),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    let tasks = &payload.tasks;
    let task_a = tasks
        .iter()
        .find(|t| t.id == "tasks/a.md")
        .expect("task a exists");
    let task_b = tasks
        .iter()
        .find(|t| t.id == "tasks/b.md")
        .expect("task b exists");

    assert_eq!(vec!["tasks/a.md".to_string()], task_b.children);
    assert!(task_a.children.is_empty());

    assert_eq!(vec!["tasks/a.md".to_string()], task_b.reverse_links);
    assert!(task_a.reverse_links.is_empty());

    assert_eq!(vec!["tasks/b.md".to_string()], task_a.links);
}

// ───────── watcher session（envelope 検証の baseline） ─────────

#[test]
fn payload_session_matches_the_current_state_values() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));

    let payload = get_tasks_impl(&state).expect("get ok");

    assert_eq!(
        dir.path().to_string_lossy().as_ref(),
        payload.session.project_key.as_str()
    );
    assert_eq!(state.test_project_generation(), payload.session.generation);
    assert_eq!(state.test_tasks_revision(), payload.session.revision);
}

#[test]
fn an_unopened_state_returns_empty_tasks_and_an_initial_session() {
    let state = Arc::new(AppState::new());

    let payload = get_tasks_impl(&state).expect("get ok");

    assert!(payload.tasks.is_empty());
    assert!(payload.projections.is_empty());
    assert_eq!(0, payload.session.generation.as_u64());
    assert_eq!(0, payload.session.revision.as_u64());
    assert_eq!(0, payload.session.event_seq.as_u64());
}

#[test]
fn payload_session_revision_refers_to_the_returned_tasks() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));
    let first = get_tasks_impl(&state).expect("get ok");

    // cache を 1 件増やしてから再取得すると、revision も一緒に進む。
    let identity = state
        .active_session_identity()
        .expect("active session identity");
    state
        .commit_session_write(&identity, |session| {
            session.tasks_mut().insert(
                std::path::PathBuf::from("tasks/b.md"),
                first.tasks[0].clone(),
            );
        })
        .expect("writable");
    let second = get_tasks_impl(&state).expect("get ok");

    assert!(first.session.revision < second.session.revision);
    assert!(first.tasks.len() < second.tasks.len());
}

// ───────── taskTree の同梱 ─────────

fn tree_root_paths(payload: &GetTasksPayload) -> Vec<&str> {
    payload
        .task_tree
        .iter()
        .map(|node| node.file_path.as_str())
        .collect()
}

fn tree_node_count(payload: &GetTasksPayload) -> usize {
    let mut count = 0;
    let mut stack: Vec<&crate::task::projection::TaskTreeNode> = payload.task_tree.iter().collect();
    while let Some(node) = stack.pop() {
        count += 1;
        stack.extend(node.children.iter());
    }
    count
}

#[test]
fn payload_contains_the_task_hierarchy_as_a_nested_tree() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    open_project_with_hierarchy(Arc::clone(&state), &dir);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(tree_root_paths(&payload), vec!["tasks/p.md"]);
    let children: Vec<&str> = payload.task_tree[0]
        .children
        .iter()
        .map(|node| node.file_path.as_str())
        .collect();
    assert_eq!(children, vec!["tasks/c2.md", "tasks/c1.md"]);
}

#[test]
fn task_tree_node_set_matches_the_task_set() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#,
    );
    write_md(dir.path(), "tasks/root.md", &task_md("Root", "Todo", None));
    write_md(
        dir.path(),
        "tasks/child.md",
        &task_md("Child", "Todo", Some("tasks/root.md")),
    );
    write_md(
        dir.path(),
        "tasks/orphan.md",
        &task_md("Orphan", "Todo", Some("tasks/missing.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(tree_node_count(&payload), payload.tasks.len());
}

#[test]
fn task_tree_roots_follow_the_same_board_order_as_tasks() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": { "Todo": ["tasks/c.md", "tasks/a.md", "tasks/b.md"] }
    }"#,
    );
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(dir.path(), "tasks/c.md", &task_md("C", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    let task_paths: Vec<&str> = payload.tasks.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(tree_root_paths(&payload), task_paths);
}

#[test]
fn unopened_state_returns_an_empty_task_tree() {
    let state = AppState::new();

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.task_tree.is_empty());
}

#[test]
fn cache_holding_a_parent_cycle_from_watcher_upsert_still_succeeds() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#,
    );
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw);

    // watcher の差分 upsert は新規循環を検出しないため、`mark_cycle_members` を
    // 通っていない循環が cache に残る経路を直接再現する。
    let cyclic = |path: &str, parent: &str| {
        let context = crate::task::parse::TaskParseContext {
            file_path: std::path::PathBuf::from(path),
            default_status: "Todo".into(),
        };
        crate::task::parse::task_from_markdown(
            format!("---\ntitle: T\nstatus: Todo\nparent: {parent}\n---\n").as_bytes(),
            &context,
        )
        .expect("fixture markdown should parse")
    };
    state
        .test_update_tasks(|tasks| {
            tasks.insert(
                std::path::PathBuf::from("tasks/x.md"),
                cyclic("tasks/x.md", "tasks/y.md"),
            );
            tasks.insert(
                std::path::PathBuf::from("tasks/y.md"),
                cyclic("tasks/y.md", "tasks/x.md"),
            );
        })
        .expect("update tasks cache");

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed even with a cycle");

    assert_eq!(tree_node_count(&payload), payload.tasks.len());
    let roots = tree_root_paths(&payload);
    assert!(roots.contains(&"tasks/x.md"));
    assert!(roots.contains(&"tasks/y.md"));
}

#[test]
fn payload_serializes_the_tree_under_the_task_tree_key() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    open_project_with_hierarchy(Arc::clone(&state), &dir);

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");
    let value = serde_json::to_value(payload).expect("payload should serialize");

    assert!(value["taskTree"].is_array());
    assert_eq!(value["taskTree"][0]["filePath"], "tasks/p.md");
}

#[test]
fn payload_carries_columns_and_done_column_from_the_same_snapshot() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    fs::create_dir_all(dir.path().join(".spec-board")).expect("create .spec-board");
    fs::write(
        dir.path().join(".spec-board/config.json"),
        r#"{"version":1,"columns":[{"name":"Doing","order":1},{"name":"Backlog","order":0}],"cardOrder":{},"doneColumn":"Doing"}"#,
    )
    .expect("write config.json");
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Backlog", None));
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(
        vec!["Backlog", "Doing"],
        payload
            .columns
            .iter()
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>(),
        "tasks の並びと同じ config から導出されるので resync でカラムも収束できる"
    );
    assert_eq!(
        Some("Doing"),
        payload.done_column.as_ref().map(|name| name.as_str())
    );
}

#[test]
fn payload_resolves_done_column_from_the_last_column_when_unset() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    fs::create_dir_all(dir.path().join(".spec-board")).expect("create .spec-board");
    fs::write(
        dir.path().join(".spec-board/config.json"),
        r#"{"version":1,"columns":[{"name":"Backlog","order":0},{"name":"Shipped","order":1}],"cardOrder":{}}"#,
    )
    .expect("write config.json");
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"));

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(
        Some("Shipped"),
        payload.done_column.as_ref().map(|name| name.as_str())
    );
}

#[test]
fn payload_has_no_columns_before_a_project_is_open() {
    let state = Arc::new(AppState::new());

    let payload = get_tasks_impl(&state).expect("get_tasks should succeed");

    assert!(payload.columns.is_empty());
    assert!(payload.done_column.is_none());
}
