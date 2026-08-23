use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::json;

use super::{ParentHierarchyErrorReason, ParentValidationFailure, Task, TaskIndex};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::parse::{task_from_markdown, TaskParseContext, TaskParseError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::warning::{TaskWarning, TaskWarningCode};

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    task_from_markdown(input.as_bytes(), &context(path)).unwrap()
}

fn task_with_parent(path: &str, parent: &str) -> Task {
    task_from(
        &format!("---\ntitle: Task\nstatus: Todo\nparent: {parent}\n---\n"),
        path,
    )
}

fn task_without_parent(path: &str) -> Task {
    task_from("---\ntitle: Task\nstatus: Todo\n---\n", path)
}

fn task_with_links_and_parent(path: &str, parent: Option<&str>, links: &[&str]) -> Task {
    let mut s = String::from("---\ntitle: Task\nstatus: Todo\n");
    if let Some(p) = parent {
        s.push_str(&format!("parent: {p}\n"));
    }
    if !links.is_empty() {
        s.push_str("links:\n");
        for l in links {
            s.push_str(&format!("  - {l}\n"));
        }
    }
    s.push_str("---\n");
    task_from(&s, path)
}

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

fn cache_from(tasks: Vec<Task>) -> HashMap<CanonicalTaskPath, Task> {
    let mut cache = HashMap::new();
    for task in tasks {
        cache.insert(CanonicalTaskPath::from_file_path(&task.file_path), task);
    }
    cache
}

/// テストから cache を引くための短縮 helper。生文字列を `Borrow` で素通しさせない
/// ため、必ず VO のコンストラクタを経由する。
fn key(path: &str) -> CanonicalTaskPath {
    CanonicalTaskPath::new(path)
}

#[test]
fn task_serializes_path_fields_and_warning_codes_as_camel_case() {
    let task = task_from(
        "---\nstatus: Todo\nestimate: 3\n---\nBody\n",
        "tasks/fix-bug.md",
    );

    let json_value = serde_json::to_value(task).unwrap();

    assert_eq!(json_value["filePath"], json!("tasks/fix-bug.md"));
    assert_eq!(json_value["reverseLinks"], json!([]));
    assert_eq!(json_value["extras"], json!({ "estimate": 3 }));
    assert_eq!(
        json_value["warnings"][0]["code"],
        json!("missingTitleUsedFileName")
    );
}

#[test]
fn parent_not_found_warning_code_serializes_as_camel_case() {
    let warning = TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".into()),
        message: "parent task was not found".to_string(),
    };

    let json_value = serde_json::to_value(warning).unwrap();

    assert_eq!(json_value["code"], json!("parentNotFound"));
}

#[test]
fn task_index_build_children_via_aggregate() {
    let tasks = vec![
        task_with_parent("tasks/child.md", "tasks/parent.md"),
        task_without_parent("tasks/parent.md"),
    ];

    let index = TaskIndex::new(tasks).build_children().unwrap();
    let result = index.into_tasks();
    let parent = result
        .iter()
        .find(|t| t.file_path == "tasks/parent.md")
        .unwrap();
    assert_eq!(parent.children, vec![TaskFilePath::from("tasks/child.md")]);
}

#[test]
fn rebuild_with_replaced_replaces_slot_and_rebuilds_derived_fields() {
    // 既存 child は parent 未指定。replaced で parent を付けると children 逆引きが再構築される。
    let tasks = vec![
        task_without_parent("tasks/child.md"),
        task_without_parent("tasks/parent.md"),
    ];
    let replaced = task_with_parent("tasks/child.md", "tasks/parent.md");

    let rebuilt = TaskIndex::new(tasks)
        .rebuild_with_replaced(replaced)
        .unwrap();
    let result = rebuilt.into_tasks();

    let parent = result
        .iter()
        .find(|t| t.file_path == "tasks/parent.md")
        .unwrap();
    assert_eq!(parent.children, vec![TaskFilePath::from("tasks/child.md")]);
}

#[test]
fn rebuild_with_replaced_appends_when_no_matching_slot() {
    let tasks = vec![task_without_parent("tasks/a.md")];
    let replaced = task_without_parent("tasks/b.md");

    let rebuilt = TaskIndex::new(tasks)
        .rebuild_with_replaced(replaced)
        .unwrap();
    let result = rebuilt.into_tasks();

    assert_eq!(result.len(), 2);
    assert!(result.iter().any(|t| t.file_path == "tasks/b.md"));
}

#[test]
fn rebuild_with_replaced_propagates_hierarchy_error() {
    let tasks = vec![task_with_parent("tasks/a.md", "tasks/b.md")];
    // replaced で b → a の親を張ると a ↔ b の循環になる。
    let replaced = task_with_parent("tasks/b.md", "tasks/a.md");

    let result = TaskIndex::new(tasks).rebuild_with_replaced(replaced);
    assert!(matches!(result, Err(TaskParseError::CycleOrTooDeep { .. })));
}

#[test]
fn task_index_validate_parent_hierarchy_via_aggregate() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let result = TaskIndex::new(tasks).validate_parent_hierarchy();
    assert!(matches!(result, Err(TaskParseError::CycleOrTooDeep { .. })));
}

#[test]
fn task_index_resolve_parent_for_new_task_via_aggregate() {
    let tasks = vec![task_without_parent("tasks/parent.md")];
    let index = TaskIndex::new(tasks);

    assert_eq!(
        index.resolve_parent_for_new_task("tasks/parent.md"),
        Some(0)
    );
    assert_eq!(index.resolve_parent_for_new_task("tasks/missing.md"), None);
}

#[test]
fn find_by_path_returns_matching_task() {
    let tasks = vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("tasks/b.md"),
    ];
    let index = TaskIndex::new(tasks);

    let found = index.find_by_path(&PathBuf::from("tasks/b.md")).unwrap();
    assert_eq!(found.file_path, TaskFilePath::from("tasks/b.md"));
}

#[test]
fn find_by_path_normalizes_notation_variants() {
    // 表記揺れ（`./tasks/a.md` / `tasks\a.md`）でも lookup 正規化で同一 task を引き当てる。
    let tasks = vec![task_without_parent("tasks/a.md")];
    let index = TaskIndex::new(tasks);

    assert!(index.find_by_path(&PathBuf::from("./tasks/a.md")).is_some());
    assert!(index.find_by_path(&PathBuf::from("tasks\\a.md")).is_some());
}

#[test]
fn find_by_path_returns_none_for_missing() {
    let tasks = vec![task_without_parent("tasks/a.md")];
    let index = TaskIndex::new(tasks);

    assert!(index
        .find_by_path(&PathBuf::from("tasks/missing.md"))
        .is_none());
}

#[test]
fn task_json_byte_level_round_trip() {
    let json = r#"{"id":"tasks/foo.md","filePath":"tasks/foo.md","title":"Fix bug","status":"Doing","priority":"High","labels":["bug","api"],"parent":"tasks/parent.md","links":["tasks/related.md"],"children":["tasks/child.md"],"reverseLinks":["tasks/source.md"],"body":"description","extras":{},"warnings":[]}"#;
    let parsed: Task = serde_json::from_str(json).unwrap();
    let serialized = serde_json::to_string(&parsed).unwrap();
    assert_eq!(serialized, json);
}

#[test]
fn task_json_round_trip_omits_none_optional_fields() {
    let json = r#"{"id":"tasks/foo.md","filePath":"tasks/foo.md","title":"Fix bug","status":"Doing","labels":[],"links":[],"children":[],"reverseLinks":[],"body":"","extras":{},"warnings":[]}"#;
    let parsed: Task = serde_json::from_str(json).unwrap();
    let serialized = serde_json::to_string(&parsed).unwrap();
    assert_eq!(serialized, json);
}

#[test]
fn task_serializes_due_as_string_when_present() {
    let task = task_from(
        "---\ntitle: T\nstatus: Todo\ndue: 2026-06-30\n---\n",
        "tasks/t.md",
    );

    let json_value = serde_json::to_value(task).unwrap();

    assert_eq!(json_value["due"], json!("2026-06-30"));
}

#[test]
fn task_omits_due_when_absent() {
    let task = task_from("---\ntitle: T\nstatus: Todo\n---\n", "tasks/t.md");

    let json_value = serde_json::to_value(task).unwrap();

    assert!(
        json_value.get("due").is_none(),
        "due should be omitted when None"
    );
}

#[test]
fn insert_new_task_into_empty_cache_adds_one_entry() {
    let mut cache = HashMap::new();
    let new_task = task_without_parent("tasks/new.md");

    let returned = TaskIndex::insert_new_task_into_cache(&mut cache, new_task.clone());

    assert_eq!(1, cache.len());
    assert!(returned.children.is_empty());
    assert!(returned.reverse_links.is_empty());
    assert_eq!(returned.file_path, "tasks/new.md");
    assert!(cache.contains_key(&key("tasks/new.md")));
}

#[test]
fn insert_new_task_appends_to_parent_children_when_parent_exists() {
    let parent = task_without_parent("tasks/parent.md");
    let mut cache = cache_from(vec![parent]);
    let new_task = task_with_parent("tasks/child.md", "tasks/parent.md");

    TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    let updated_parent = cache.get(&key("tasks/parent.md")).unwrap();
    assert_eq!(
        vec![TaskFilePath::from("tasks/child.md")],
        updated_parent.children
    );
}

#[test]
fn insert_new_task_appends_to_target_reverse_links_when_link_exists() {
    let target = task_without_parent("tasks/target.md");
    let mut cache = cache_from(vec![target]);
    let new_task = task_with_links_and_parent("tasks/source.md", None, &["tasks/target.md"]);

    TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    let updated_target = cache.get(&key("tasks/target.md")).unwrap();
    assert_eq!(
        vec![TaskFilePath::from("tasks/source.md")],
        updated_target.reverse_links
    );
}

#[test]
fn insert_new_task_appends_target_reverse_link_only_once_for_duplicate_targets() {
    let target = task_without_parent("tasks/target.md");
    let mut cache = cache_from(vec![target]);
    let new_task = task_with_links_and_parent(
        "tasks/source.md",
        None,
        &["tasks/target.md", "tasks/target.md"],
    );

    TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    let updated_target = cache.get(&key("tasks/target.md")).unwrap();
    assert_eq!(
        vec![TaskFilePath::from("tasks/source.md")],
        updated_target.reverse_links,
        "duplicate targets must append reverse link only once"
    );
}

#[test]
fn insert_new_task_resolves_incoming_parent_into_new_task_children() {
    let existing = task_with_parent("tasks/a.md", "tasks/new.md");
    let mut cache = cache_from(vec![existing]);
    let new_task = task_without_parent("tasks/new.md");

    let returned = TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    assert_eq!(vec![TaskFilePath::from("tasks/a.md")], returned.children);
    let cached_new = cache.get(&key("tasks/new.md")).unwrap();
    assert_eq!(vec![TaskFilePath::from("tasks/a.md")], cached_new.children);
}

#[test]
fn insert_new_task_resolves_incoming_links_into_new_task_reverse_links() {
    let existing = task_with_links_and_parent("tasks/source.md", None, &["tasks/new.md"]);
    let mut cache = cache_from(vec![existing]);
    let new_task = task_without_parent("tasks/new.md");

    let returned = TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    assert_eq!(
        vec![TaskFilePath::from("tasks/source.md")],
        returned.reverse_links
    );
}

#[test]
fn insert_new_task_leaves_cache_unchanged_when_parent_and_links_dangling() {
    let mut cache = HashMap::new();
    let new_task = task_with_links_and_parent(
        "tasks/new.md",
        Some("tasks/missing-parent.md"),
        &["tasks/missing-link.md"],
    );

    let returned = TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    assert_eq!(1, cache.len(), "only new_task inserted");
    assert!(returned.children.is_empty());
    assert!(returned.reverse_links.is_empty());
}

#[test]
fn insert_new_task_dedups_repeated_link_target_into_single_reverse_link() {
    let target = task_without_parent("tasks/target.md");
    let mut cache = cache_from(vec![target]);
    let mut new_task = task_without_parent("tasks/source.md");
    new_task.links = vec![
        TaskFilePath::from("tasks/target.md"),
        TaskFilePath::from("tasks/target.md"),
    ];

    TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    let updated_target = cache.get(&key("tasks/target.md")).unwrap();
    assert_eq!(
        vec![TaskFilePath::from("tasks/source.md")],
        updated_target.reverse_links,
        "duplicate link target should produce only one reverse_link"
    );
}

#[test]
fn insert_new_task_appends_to_existing_children_at_end_regardless_of_lex_order() {
    let parent = task_without_parent("tasks/zzz-parent.md");
    let mut a = task_with_parent("tasks/m-child.md", "tasks/zzz-parent.md");
    a.children = Vec::new();
    let mut parent_pre = parent;
    parent_pre.children = vec![TaskFilePath::from("tasks/m-child.md")];
    let mut cache = cache_from(vec![parent_pre, a]);

    let new_task = task_with_parent("tasks/a-child.md", "tasks/zzz-parent.md");
    TaskIndex::insert_new_task_into_cache(&mut cache, new_task);

    let parent_now = cache.get(&key("tasks/zzz-parent.md")).unwrap();
    assert_eq!(
        vec![
            TaskFilePath::from("tasks/m-child.md"),
            TaskFilePath::from("tasks/a-child.md"),
        ],
        parent_now.children,
        "new child should be appended at end, not lex-sorted"
    );
}

#[test]
fn insert_new_task_matches_full_rebuild_with_build_children_and_build_reverse_links() {
    let existing = vec![
        task_with_links_and_parent("tasks/a.md", Some("tasks/new.md"), &["tasks/new.md"]),
        task_without_parent("tasks/b.md"),
        task_with_links_and_parent("tasks/c.md", None, &["tasks/new.md", "tasks/b.md"]),
    ];
    let new_task = task_with_links_and_parent("tasks/new.md", Some("tasks/b.md"), &["tasks/c.md"]);

    let prebuilt = TaskIndex::new(existing.clone())
        .build_children()
        .expect("no cycle")
        .build_reverse_links()
        .into_tasks();
    let mut cache = cache_from(prebuilt);
    TaskIndex::insert_new_task_into_cache(&mut cache, new_task.clone());
    let mut diff_tasks: Vec<Task> = cache.values().cloned().collect();
    diff_tasks.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    let mut all = existing.clone();
    all.push(new_task);
    let rebuilt = TaskIndex::new(all)
        .build_children()
        .expect("no cycle")
        .build_reverse_links()
        .into_tasks();
    let mut full_tasks = rebuilt;
    full_tasks.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    assert_eq!(full_tasks.len(), diff_tasks.len());
    for (a, b) in full_tasks.iter().zip(diff_tasks.iter()) {
        assert_eq!(a.file_path, b.file_path);
        let mut a_children = a.children.clone();
        let mut b_children = b.children.clone();
        a_children.sort();
        b_children.sort();
        assert_eq!(
            a_children, b_children,
            "children for {} mismatched (as set)",
            a.file_path
        );
        let mut a_rl = a.reverse_links.clone();
        let mut b_rl = b.reverse_links.clone();
        a_rl.sort();
        b_rl.sort();
        assert_eq!(
            a_rl, b_rl,
            "reverse_links for {} mismatched (as set)",
            a.file_path
        );
    }
}

#[test]
fn validate_parent_for_new_task_ok_cases() {
    let single = vec![task_without_parent("tasks/a.md")];
    let chain_19 = parent_chain_with_edge_count(19);

    let cases: Vec<(Option<&str>, Vec<Task>, &str)> = vec![
        (None, Vec::new(), "parent=None / empty existing"),
        (None, single.clone(), "parent=None / non-empty existing"),
        (Some("tasks/a.md"), single.clone(), "existing root parent"),
        (
            Some("./tasks/a.md"),
            single.clone(),
            "leading ./ normalized",
        ),
        (Some("tasks\\a.md"), single.clone(), "backslash separator"),
        (
            Some("tasks/0.md"),
            chain_19,
            "edge 19 chain (total 20 = MAX)",
        ),
    ];
    for (parent, tasks, label) in cases {
        let result = TaskIndex::from(tasks).validate_new_parent(parent);
        assert!(result.is_ok(), "{label}: {result:?}");
    }
}

#[test]
fn validate_parent_for_new_task_not_found_cases() {
    let single = vec![task_without_parent("tasks/a.md")];

    let cases: Vec<(&str, Vec<Task>, &str)> = vec![
        ("tasks/missing.md", single.clone(), "no matching path"),
        ("", single.clone(), "empty parent string"),
        ("/abs/path.md", single.clone(), "absolute path"),
        ("C:\\foo.md", single.clone(), "windows drive prefix"),
        (
            "tasks/self.md",
            single.clone(),
            "self reference (new task not yet registered)",
        ),
        ("tasks/a.md", Vec::new(), "empty existing tasks"),
    ];
    for (parent, tasks, label) in cases {
        let result = TaskIndex::from(tasks).validate_new_parent(Some(parent));
        assert_eq!(
            result,
            Err(ParentValidationFailure::NotFound {
                parent: parent.to_string(),
            }),
            "{label}"
        );
    }
}

#[test]
fn sorted_by_id_returns_empty_for_empty_index() {
    let result = TaskIndex::new(vec![]).sorted_by_id();
    assert!(result.is_empty());
}

#[test]
fn sorted_by_id_returns_single_task_unchanged() {
    let tasks = vec![task_without_parent("tasks/a.md")];
    let result = TaskIndex::new(tasks).sorted_by_id();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].file_path, "tasks/a.md");
}

#[test]
fn sorted_by_id_sorts_reverse_order_ascending() {
    let tasks = vec![
        task_without_parent("tasks/c.md"),
        task_without_parent("tasks/b.md"),
        task_without_parent("tasks/a.md"),
    ];
    let result = TaskIndex::new(tasks).sorted_by_id();
    let ids: Vec<_> = result.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(ids, vec!["tasks/a.md", "tasks/b.md", "tasks/c.md"]);
}

#[test]
fn sorted_by_id_sorts_random_order_ascending() {
    let tasks = vec![
        task_without_parent("tasks/b.md"),
        task_without_parent("tasks/d.md"),
        task_without_parent("tasks/a.md"),
        task_without_parent("tasks/c.md"),
    ];
    let result = TaskIndex::new(tasks).sorted_by_id();
    let ids: Vec<_> = result.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(
        ids,
        vec!["tasks/a.md", "tasks/b.md", "tasks/c.md", "tasks/d.md"]
    );
}

#[test]
fn sorted_by_id_preserves_input_order_for_duplicate_ids() {
    let mut first = task_without_parent("tasks/dup.md");
    first.title = "first".into();
    let mut second = task_without_parent("tasks/dup.md");
    second.title = "second".into();
    let tasks = vec![first, second];
    let result = TaskIndex::new(tasks).sorted_by_id();
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].title, "first");
    assert_eq!(result[1].title, "second");
}

#[test]
fn validate_parent_for_new_task_cycle_or_too_deep_cases() {
    let chain_20 = parent_chain_with_edge_count(20);
    let cycle_pair = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let cases: Vec<(&str, Vec<Task>, ParentHierarchyErrorReason, &str)> = vec![
        (
            "tasks/0.md",
            chain_20,
            ParentHierarchyErrorReason::TooDeep,
            "edge 20 chain (total 21 exceeds MAX)",
        ),
        (
            "tasks/a.md",
            cycle_pair,
            ParentHierarchyErrorReason::Cycle,
            "two-node cycle a <-> b",
        ),
    ];
    for (parent, tasks, expected_reason, label) in cases {
        let result = TaskIndex::from(tasks).validate_new_parent(Some(parent));
        assert_eq!(
            result,
            Err(ParentValidationFailure::ChainInvalid {
                parent: parent.to_string(),
                reason: expected_reason,
            }),
            "{label}"
        );
    }
}

// ───────── rebuild_derived_with_warnings ─────────

#[test]
fn rebuild_derived_with_warnings_builds_children_and_reverse_links() {
    let tasks = vec![
        task_with_links_and_parent("tasks/parent.md", None, &[]),
        task_with_links_and_parent(
            "tasks/child.md",
            Some("tasks/parent.md"),
            &["tasks/parent.md"],
        ),
    ];

    let rebuilt = TaskIndex::new(tasks)
        .rebuild_derived_with_warnings()
        .expect("no cycle")
        .into_tasks();

    let parent = rebuilt
        .iter()
        .find(|task| task.file_path == "tasks/parent.md")
        .expect("parent present");
    assert_eq!(vec!["tasks/child.md".to_string()], parent.children);
    assert_eq!(vec!["tasks/child.md".to_string()], parent.reverse_links);
}

#[test]
fn rebuild_derived_with_warnings_does_not_depend_on_the_input_order() {
    let tasks = vec![
        task_with_links_and_parent("tasks/a.md", Some("tasks/b.md"), &["tasks/c.md"]),
        task_with_links_and_parent("tasks/b.md", None, &["tasks/a.md"]),
        task_with_links_and_parent("tasks/c.md", Some("tasks/b.md"), &[]),
    ];
    let mut descending = tasks.clone();
    descending.reverse();

    // aggregate は手動チェーンの前に file_path 昇順の整列を挟むので、昇順で与えた
    // 手動チェーンと、降順で与えた aggregate が一致する。「入力順に依存しない」ことが
    // 「watcher 適用後 == 再 open」の前提なので、それをこのテストで固定する。
    let chained = TaskIndex::new(tasks)
        .build_children_with_warnings()
        .expect("no cycle")
        .build_reverse_links()
        .into_tasks();
    let aggregated = TaskIndex::new(descending)
        .rebuild_derived_with_warnings()
        .expect("no cycle")
        .into_tasks();

    assert_eq!(chained, aggregated);
}

#[test]
fn rebuild_derived_with_warnings_marks_cycles_as_warnings_instead_of_failing() {
    let tasks = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let rebuilt = TaskIndex::new(tasks)
        .rebuild_derived_with_warnings()
        .expect("循環は Err ではなく warning になる")
        .into_tasks();

    for task in &rebuilt {
        assert_eq!(None, task.parent);
        assert!(task
            .warnings
            .iter()
            .any(|warning| warning.code == TaskWarningCode::ParentCycle));
    }
}

#[test]
fn rebuild_derived_with_warnings_accepts_an_empty_task_set() {
    let rebuilt = TaskIndex::new(Vec::new())
        .rebuild_derived_with_warnings()
        .expect("空集合でも成功する")
        .into_tasks();

    assert!(rebuilt.is_empty());
}

// ───────── sorted_by_board_order ─────────

fn board_config(columns: &[&str], card_order: &[(&str, &[&str])]) -> crate::config::Config {
    use crate::config::{CardOrder, Column, Config};
    let mut order = CardOrder::default();
    for (column, paths) in card_order {
        order.set_column(column, paths);
    }
    Config {
        version: 1,
        columns: columns
            .iter()
            .enumerate()
            .map(|(index, name)| Column {
                name: (*name).into(),
                order: index as u32,
                color: None,
                wip_limit: None,
            })
            .collect(),
        card_order: order,
        done_column: None,
    }
}

fn task_with_status(path: &str, status: &str) -> Task {
    task_from(&format!("---\ntitle: Task\nstatus: {status}\n---\n"), path)
}

#[test]
fn sorted_by_board_order_orders_by_column_then_card_order() {
    let config = board_config(
        &["Todo", "Done"],
        &[("Todo", &["tasks/b.md", "tasks/a.md"])],
    );
    let tasks = vec![
        task_with_status("tasks/a.md", "Todo"),
        task_with_status("tasks/z.md", "Done"),
        task_with_status("tasks/b.md", "Todo"),
    ];

    let sorted = TaskIndex::new(tasks).sorted_by_board_order(&config);

    let paths: Vec<&str> = sorted.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(vec!["tasks/b.md", "tasks/a.md", "tasks/z.md"], paths);
}

#[test]
fn sorted_by_board_order_appends_unlisted_tasks_by_id() {
    let config = board_config(&["Todo"], &[("Todo", &["tasks/c.md"])]);
    let tasks = vec![
        task_with_status("tasks/b.md", "Todo"),
        task_with_status("tasks/a.md", "Todo"),
        task_with_status("tasks/c.md", "Todo"),
    ];

    let sorted = TaskIndex::new(tasks).sorted_by_board_order(&config);

    let paths: Vec<&str> = sorted.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(vec!["tasks/c.md", "tasks/a.md", "tasks/b.md"], paths);
}

#[test]
fn sorted_by_board_order_puts_unknown_status_last() {
    let config = board_config(&["Todo"], &[]);
    let tasks = vec![
        task_with_status("tasks/x.md", "Archived"),
        task_with_status("tasks/a.md", "Todo"),
    ];

    let sorted = TaskIndex::new(tasks).sorted_by_board_order(&config);

    let paths: Vec<&str> = sorted.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(vec!["tasks/a.md", "tasks/x.md"], paths);
}

// ───────── board_order_of_column ─────────

#[test]
fn board_order_of_column_returns_card_order_sequence_when_all_tasks_are_listed() {
    let config = board_config(
        &["Todo", "Done"],
        &[("Todo", &["tasks/b.md", "tasks/a.md"])],
    );
    let index = TaskIndex::new(vec![
        task_with_status("tasks/a.md", "Todo"),
        task_with_status("tasks/b.md", "Todo"),
        task_with_status("tasks/z.md", "Done"),
    ]);

    let order = index.board_order_of_column(&config, "Todo");

    assert_eq!(vec!["tasks/b.md", "tasks/a.md"], order);
}

#[test]
fn board_order_of_column_appends_unlisted_tasks_by_id() {
    let config = board_config(&["Todo"], &[("Todo", &["tasks/c.md"])]);
    let index = TaskIndex::new(vec![
        task_with_status("tasks/b.md", "Todo"),
        task_with_status("tasks/a.md", "Todo"),
        task_with_status("tasks/c.md", "Todo"),
    ]);

    let order = index.board_order_of_column(&config, "Todo");

    assert_eq!(vec!["tasks/c.md", "tasks/a.md", "tasks/b.md"], order);
}

#[test]
fn board_order_of_column_falls_back_to_id_order_when_column_has_no_card_order_entry() {
    let config = board_config(&["Todo"], &[]);
    let index = TaskIndex::new(vec![
        task_with_status("tasks/b.md", "Todo"),
        task_with_status("tasks/a.md", "Todo"),
    ]);

    let order = index.board_order_of_column(&config, "Todo");

    assert_eq!(vec!["tasks/a.md", "tasks/b.md"], order);
}

#[test]
fn board_order_of_column_returns_empty_for_column_without_tasks() {
    let config = board_config(&["Todo", "Done"], &[]);
    let index = TaskIndex::new(vec![task_with_status("tasks/a.md", "Todo")]);

    let order = index.board_order_of_column(&config, "Done");

    assert!(order.is_empty());
}

#[test]
fn board_order_of_column_ignores_card_order_entries_for_deleted_tasks() {
    // cardOrder に削除済みタスクのパスが残留していても、返るのは実在する
    // resident task だけ。存在しないパスまで返すと、FE から見えないゴーストとの
    // 不一致で期待値照合が誤って移動を拒否する。
    let config = board_config(&["Todo"], &[("Todo", &["tasks/deleted.md", "tasks/a.md"])]);
    let index = TaskIndex::new(vec![task_with_status("tasks/a.md", "Todo")]);

    let order = index.board_order_of_column(&config, "Todo");

    assert_eq!(vec!["tasks/a.md"], order);
}

#[test]
fn board_order_of_column_matches_sorted_by_board_order_for_the_same_column() {
    // 並び規則が sorted_by_board_order と 2 箇所に分かれるため、同じ config /
    // tasks に対して両者のカラム部分が完全一致することを固定する。
    let config = board_config(
        &["Todo", "Done"],
        &[("Todo", &["tasks/c.md", "tasks/a.md"])],
    );
    let tasks = vec![
        task_with_status("tasks/a.md", "Todo"),
        task_with_status("tasks/b.md", "Todo"),
        task_with_status("tasks/c.md", "Todo"),
        task_with_status("tasks/z.md", "Done"),
    ];

    let order = TaskIndex::new(tasks.clone()).board_order_of_column(&config, "Todo");
    let sorted: Vec<String> = TaskIndex::new(tasks)
        .sorted_by_board_order(&config)
        .into_iter()
        .filter(|task| task.status.as_str() == "Todo")
        .map(|task| task.file_path.as_str().to_string())
        .collect();

    assert_eq!(sorted, order);
}

// ───────── project_board_view ─────────

fn task_with_status_and_parent(path: &str, status: &str, parent: Option<&str>) -> Task {
    let mut source = format!("---\ntitle: Task\nstatus: {status}\n");
    if let Some(parent) = parent {
        source.push_str(&format!("parent: {parent}\n"));
    }
    source.push_str("---\n");
    task_from(&source, path)
}

fn file_paths(tasks: &[Task]) -> Vec<&str> {
    tasks.iter().map(|task| task.file_path.as_str()).collect()
}

#[test]
fn project_board_view_derives_every_output_from_the_same_ordered_task_set() {
    let config = board_config(
        &["Todo", "Done"],
        &[("Todo", &["tasks/c.md", "tasks/a.md"])],
    );
    let tasks = vec![
        task_with_status_and_parent("tasks/a.md", "Todo", None),
        task_with_status_and_parent("tasks/z.md", "Done", Some("tasks/c.md")),
        task_with_status_and_parent("tasks/c.md", "Todo", None),
    ];

    let view = TaskIndex::project_board_view(tasks, &config);

    assert_eq!(
        file_paths(&view.tasks),
        vec!["tasks/c.md", "tasks/a.md", "tasks/z.md"],
        "tasks は board 表示順"
    );
    let projection_keys: Vec<&str> = view.projections.keys().map(|key| key.as_str()).collect();
    assert_eq!(
        projection_keys,
        vec!["tasks/a.md", "tasks/c.md", "tasks/z.md"],
        "projection のキー集合が tasks と一致する"
    );
    let root_paths: Vec<&str> = view
        .task_tree
        .iter()
        .map(|node| node.file_path.as_str())
        .collect();
    assert_eq!(
        root_paths,
        vec!["tasks/c.md", "tasks/a.md"],
        "taskTree の root 列も同じ board 順から作られる"
    );
    assert_eq!(
        view.task_tree[0].children.len(),
        1,
        "tasks/z.md は tasks/c.md の子として 1 度だけ現れる"
    );
}

#[test]
fn project_board_view_keeps_child_file_paths_sorted_while_tree_children_follow_board_order() {
    let config = board_config(
        &["Todo"],
        &[("Todo", &["tasks/a.md", "tasks/z.md", "tasks/b.md"])],
    );
    let tasks = vec![
        task_with_status_and_parent("tasks/a.md", "Todo", None),
        task_with_status_and_parent("tasks/b.md", "Todo", Some("tasks/a.md")),
        task_with_status_and_parent("tasks/z.md", "Todo", Some("tasks/a.md")),
    ];

    let view = TaskIndex::project_board_view(tasks, &config);

    let projection_children: Vec<&str> = view.projections["tasks/a.md"]
        .child_file_paths
        .iter()
        .map(|path| path.as_str())
        .collect();
    assert_eq!(
        projection_children,
        vec!["tasks/b.md", "tasks/z.md"],
        "projection の child_file_paths は file_path 昇順のまま"
    );
    let tree_children: Vec<&str> = view.task_tree[0]
        .children
        .iter()
        .map(|node| node.file_path.as_str())
        .collect();
    assert_eq!(
        tree_children,
        vec!["tasks/z.md", "tasks/b.md"],
        "taskTree の children は board 順"
    );
}

#[test]
fn project_board_view_returns_empty_outputs_for_no_tasks() {
    let config = board_config(&["Todo"], &[]);

    let view = TaskIndex::project_board_view(Vec::new(), &config);

    assert!(view.tasks.is_empty());
    assert!(view.projections.is_empty());
    assert!(view.milestone_projections.is_empty());
    assert!(view.task_tree.is_empty());
}
