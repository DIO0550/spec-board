//! `TaskIndex::project_all` のユニットテスト。
//!
//! # fixture の作り方
//!
//! `project_all` は `Task.parent` から children adjacency を毎回組み直す
//! （`tasks_cache` 上の `Task.children` は watcher upsert / 非 parent の
//! `update_task` で古くなるため信頼できない）。したがって fixture では
//! `children` ではなく **`parent` を与える**。`children` を手組みするヘルパを
//! 作ると、テストが何も検証しない状態になる。
//!
//! # サイクル系テストの位置づけ
//!
//! `tasks_cache` に A->B->A の parent 循環が載った状態は、projection より前段で
//! 循環が warning へ倒される（`build_children_with_warnings` が parent を None 化する）
//! ため、通常の経路では発生しない。ただし projection は cache をそのまま受け取る
//! 独立した計算であり、上流の不変条件に寄りかからず自力で有限停止することを
//! 契約として固定しておく。以下のサイクル / 自己参照テストはその契約の固定。

use std::path::PathBuf;

use serde_json::json;

use super::*;
use crate::config::column_name::ColumnName;
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::task_index::{Task, TaskIndex};

/// テスト用 Task を最小構成で作る。`children` は常に空のまま渡し、
/// `project_all` がそれを見ていないことを fixture 自体で表現する。
fn task(file_path: &str, status: &str, parent: Option<&str>) -> Task {
    let mut markdown = format!("---\ntitle: Task\nstatus: {status}\n");
    if let Some(parent) = parent {
        // backslash 区切りの parent を試すため、escape 解釈のない single quote を使う。
        markdown.push_str(&format!("parent: '{parent}'\n"));
    }
    markdown.push_str("---\n");

    let context = TaskParseContext {
        file_path: PathBuf::from(file_path),
        default_status: ColumnName::from("Todo"),
    };
    crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(markdown.as_bytes(), &context).expect("fixture markdown should parse"),
    )
}

fn done(name: &str) -> ColumnName {
    ColumnName::from(name)
}

fn project(tasks: Vec<Task>, done_column: Option<&ColumnName>) -> TaskProjectionMap {
    TaskIndex::new(tasks).project_all(done_column)
}

fn progress_of(map: &TaskProjectionMap, file_path: &str) -> SubIssueProgress {
    map.get(file_path)
        .unwrap_or_else(|| panic!("projection for {file_path}"))
        .sub_issue_progress
}

fn child_paths_of(map: &TaskProjectionMap, file_path: &str) -> Vec<String> {
    map.get(file_path)
        .unwrap_or_else(|| panic!("projection for {file_path}"))
        .child_file_paths
        .iter()
        .map(|path| path.as_str().to_owned())
        .collect()
}

// ───────── 直接子の集計 ─────────

#[test]
fn task_without_children_has_zero_progress() {
    let map = project(vec![task("tasks/a.md", "Todo", None)], None);

    assert_eq!(
        progress_of(&map, "tasks/a.md"),
        SubIssueProgress { done: 0, total: 0 }
    );
}

#[test]
fn total_matches_direct_child_count() {
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c1.md", "Todo", Some("tasks/p.md")),
        task("tasks/c2.md", "Todo", Some("tasks/p.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/p.md").total, 2);
}

/// `Task.children` が空でも `parent` から adjacency が組み直されることを固定する。
/// この 1 件が落ちる = projection が cache の派生値に逆戻りしている。
#[test]
fn derives_children_from_parent_even_when_children_field_is_empty() {
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c.md", "Todo", Some("tasks/p.md")),
    ];
    assert!(
        tasks.iter().all(|task| task.children().is_empty()),
        "fixture は children を空のまま渡す前提"
    );

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/p.md").total, 1);
    assert_eq!(child_paths_of(&map, "tasks/p.md"), vec!["tasks/c.md"]);
}

#[test]
fn child_file_paths_are_sorted_by_file_path() {
    let tasks = vec![
        task("tasks/c3.md", "Todo", Some("tasks/p.md")),
        task("tasks/c1.md", "Todo", Some("tasks/p.md")),
        task("tasks/p.md", "Todo", None),
        task("tasks/c2.md", "Todo", Some("tasks/p.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(
        child_paths_of(&map, "tasks/p.md"),
        vec!["tasks/c1.md", "tasks/c2.md", "tasks/c3.md"]
    );
}

// ───────── 全子孫への一般化 ─────────

#[test]
fn counts_all_descendants_not_only_direct_children() {
    let tasks = vec![
        task("tasks/root.md", "Todo", None),
        task("tasks/child.md", "Todo", Some("tasks/root.md")),
        task("tasks/grandchild.md", "Todo", Some("tasks/child.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/root.md").total, 2);
    assert_eq!(progress_of(&map, "tasks/child.md").total, 1);
}

#[test]
fn counts_descendants_across_four_levels() {
    let tasks = vec![
        task("tasks/l0.md", "Todo", None),
        task("tasks/l1.md", "Todo", Some("tasks/l0.md")),
        task("tasks/l2.md", "Todo", Some("tasks/l1.md")),
        task("tasks/l3.md", "Todo", Some("tasks/l2.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/l0.md").total, 3);
}

#[test]
fn excludes_root_itself_from_progress() {
    let done_column = done("Done");
    let tasks = vec![
        task("tasks/root.md", "Done", None),
        task("tasks/child.md", "Todo", Some("tasks/root.md")),
    ];

    let map = project(tasks, Some(&done_column));

    assert_eq!(
        progress_of(&map, "tasks/root.md"),
        SubIssueProgress { done: 0, total: 1 }
    );
}

// ───────── 完了判定 ─────────

#[test]
fn is_done_is_true_when_status_matches_done_column() {
    let done_column = done("Done");

    let map = project(vec![task("tasks/a.md", "Done", None)], Some(&done_column));

    assert!(map["tasks/a.md"].is_done);
}

#[test]
fn is_done_is_false_when_status_differs_from_done_column() {
    let done_column = done("Done");

    let map = project(vec![task("tasks/a.md", "Todo", None)], Some(&done_column));

    assert!(!map["tasks/a.md"].is_done);
}

#[test]
fn counts_descendants_in_done_column_as_done() {
    let done_column = done("Done");
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c1.md", "Done", Some("tasks/p.md")),
        task("tasks/c2.md", "Todo", Some("tasks/p.md")),
        task("tasks/g1.md", "Done", Some("tasks/c2.md")),
    ];

    let map = project(tasks, Some(&done_column));

    assert_eq!(
        progress_of(&map, "tasks/p.md"),
        SubIssueProgress { done: 2, total: 3 }
    );
}

// ───────── 直接子の抽出 ─────────

#[test]
fn child_file_paths_exclude_grandchildren() {
    let tasks = vec![
        task("tasks/root.md", "Todo", None),
        task("tasks/child.md", "Todo", Some("tasks/root.md")),
        task("tasks/grandchild.md", "Todo", Some("tasks/child.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(
        child_paths_of(&map, "tasks/root.md"),
        vec!["tasks/child.md"]
    );
}

#[test]
fn task_with_unresolvable_parent_is_nobodys_child() {
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/orphan.md", "Todo", Some("tasks/missing.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/p.md").total, 0);
    assert!(child_paths_of(&map, "tasks/p.md").is_empty());
}

#[test]
fn parent_values_that_cannot_be_normalized_are_not_linked() {
    let cases = ["", "/abs/tasks/p.md", "C:/tasks/p.md"];

    for parent in cases {
        let tasks = vec![
            task("tasks/p.md", "Todo", None),
            task("tasks/c.md", "Todo", Some(parent)),
        ];

        let map = project(tasks, None);

        assert_eq!(
            progress_of(&map, "tasks/p.md").total,
            0,
            "parent={parent:?} は adjacency に載らない"
        );
    }
}

/// 子が書いた raw 参照ではなく、解決先 task 自身の `file_path` が入ることを固定する。
#[test]
fn child_file_paths_hold_resolved_task_paths_not_raw_parent_refs() {
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c.md", "Todo", Some("./tasks/p.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(child_paths_of(&map, "tasks/p.md"), vec!["tasks/c.md"]);
}

// ───────── map / IPC の契約 ─────────

#[test]
fn map_keys_are_raw_file_paths() {
    let map = project(vec![task("docs/notes/a.md", "Todo", None)], None);

    assert_eq!(map.keys().collect::<Vec<_>>(), vec!["docs/notes/a.md"]);
}

#[test]
fn map_contains_an_entry_for_every_task_including_leaves() {
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c.md", "Todo", Some("tasks/p.md")),
        task("tasks/lonely.md", "Todo", None),
    ];

    let map = project(tasks, None);

    assert_eq!(map.len(), 3);
}

#[test]
fn projection_serializes_to_camel_case_without_percentage() {
    let projection = TaskProjection {
        sub_issue_progress: SubIssueProgress { done: 1, total: 2 },
        is_done: false,
        child_file_paths: vec!["tasks/c.md".into()],
    };

    let value = serde_json::to_value(&projection).expect("serializable");

    assert_eq!(
        value,
        json!({
            "subIssueProgress": { "done": 1, "total": 2 },
            "isDone": false,
            "childFilePaths": ["tasks/c.md"],
        })
    );
}

#[test]
fn milestone_projection_serializes_task_file_paths_to_camel_case() {
    let projection = MilestoneProjection {
        done: 1,
        total: 2,
        task_file_paths: vec!["tasks/a.md".into(), "tasks/b.md".into()],
    };

    let value = serde_json::to_value(&projection).expect("serializable");

    assert_eq!(
        value,
        json!({
            "done": 1,
            "total": 2,
            "taskFilePaths": ["tasks/a.md", "tasks/b.md"],
        })
    );
}

#[test]
fn empty_milestone_projection_map_serializes_as_an_empty_object() {
    let value =
        serde_json::to_value(MilestoneProjectionMap::new()).expect("empty map serializable");

    assert_eq!(value, json!({}));
}

#[test]
fn milestone_projection_map_serializes_special_names_losslessly() {
    let mut projections = MilestoneProjectionMap::new();
    for name in ["__proto__", "constructor", "toString"] {
        projections.insert(
            name.to_owned(),
            MilestoneProjection {
                done: 0,
                total: 1,
                task_file_paths: vec![format!("tasks/{name}.md").into()],
            },
        );
    }

    let value = serde_json::to_value(&projections).expect("map serializable");

    assert_eq!(value["__proto__"]["total"], 1);
    assert_eq!(value["constructor"]["total"], 1);
    assert_eq!(value["toString"]["total"], 1);
}

// ───────── エッジケース ─────────

/// watcher 経由で作られうる parent 循環でも有限停止することを固定する。
/// `handle_upsert` は新規 parent 循環を検出しないため、この状態は実データで到達する。
#[test]
fn stops_on_cycle_and_excludes_root_itself() {
    let tasks = vec![
        task("tasks/a.md", "Todo", Some("tasks/b.md")),
        task("tasks/b.md", "Todo", Some("tasks/a.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/a.md").total, 1);
    assert_eq!(progress_of(&map, "tasks/b.md").total, 1);
}

#[test]
fn self_referencing_task_has_no_children() {
    let tasks = vec![task("tasks/a.md", "Todo", Some("tasks/a.md"))];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/a.md").total, 0);
    assert!(child_paths_of(&map, "tasks/a.md").is_empty());
}

/// 菱形（root -> b1/b2 -> c）で c へ 2 経路到達しても 1 回だけ数える。
#[test]
fn counts_descendant_reachable_through_multiple_paths_once() {
    let tasks = vec![
        task("tasks/root.md", "Todo", None),
        task("tasks/b1.md", "Todo", Some("tasks/root.md")),
        task("tasks/b2.md", "Todo", Some("tasks/root.md")),
        task("tasks/c.md", "Todo", Some("tasks/b1.md")),
        task("tasks/d.md", "Todo", Some("tasks/b2.md")),
    ];

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/root.md").total, 4);
}

#[test]
fn absorbs_parent_path_notation_variants() {
    let cases = ["./tasks/p.md", "tasks/./p.md", "tasks\\p.md"];

    for parent in cases {
        let tasks = vec![
            task("tasks/p.md", "Todo", None),
            task("tasks/c.md", "Todo", Some(parent)),
        ];

        let map = project(tasks, None);

        assert_eq!(
            progress_of(&map, "tasks/p.md").total,
            1,
            "parent={parent:?} は tasks/p.md に解決する"
        );
    }
}

// ───────── 境界値 ─────────

#[test]
fn without_done_column_nothing_is_done() {
    let tasks = vec![
        task("tasks/p.md", "Done", None),
        task("tasks/c.md", "Done", Some("tasks/p.md")),
    ];

    let map = project(tasks, None);

    assert!(!map["tasks/p.md"].is_done);
    assert_eq!(progress_of(&map, "tasks/p.md").done, 0);
}

#[test]
fn empty_task_set_projects_to_empty_map() {
    let map = project(Vec::new(), Some(&done("Done")));

    assert!(map.is_empty());
}

#[test]
fn done_column_with_spaces_matches_exactly() {
    let done_column = done("In Progress");
    let tasks = vec![
        task("tasks/a.md", "In Progress", None),
        task("tasks/b.md", "InProgress", None),
    ];

    let map = project(tasks, Some(&done_column));

    assert!(map["tasks/a.md"].is_done);
    assert!(!map["tasks/b.md"].is_done);
}

// ───────── べき等性・決定性 ─────────

#[test]
fn repeated_calls_produce_identical_maps_including_key_order() {
    let done_column = done("Done");
    let tasks = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c1.md", "Done", Some("tasks/p.md")),
        task("tasks/c2.md", "Todo", Some("tasks/p.md")),
    ];
    let index = TaskIndex::new(tasks);

    let first = index.project_all(Some(&done_column));
    let second = index.project_all(Some(&done_column));

    assert_eq!(first, second);
    assert_eq!(
        first.keys().collect::<Vec<_>>(),
        second.keys().collect::<Vec<_>>()
    );
}

#[test]
fn task_order_does_not_affect_the_projection_map() {
    let done_column = done("Done");
    let ordered = vec![
        task("tasks/p.md", "Todo", None),
        task("tasks/c1.md", "Done", Some("tasks/p.md")),
        task("tasks/c2.md", "Todo", Some("tasks/p.md")),
        task("tasks/g.md", "Todo", Some("tasks/c1.md")),
    ];
    let mut reversed = ordered.clone();
    reversed.reverse();

    let from_ordered = project(ordered, Some(&done_column));
    let from_reversed = project(reversed, Some(&done_column));

    assert_eq!(from_ordered, from_reversed);
}

// ───────── 計算量特性の characterization ─────────

/// 直線チェーン 1000 件で再帰なしに完走することを固定する。
///
/// 性能の閾値テストではなく、反復実装と訪問回数特性を固定する characterization。
/// bottom-up の O(N) 集約に変えても値は同じなので、性能改善の検出には使えない。
#[test]
fn deep_chain_is_traversed_iteratively_without_stack_overflow() {
    let depth = 1000;
    let mut tasks = vec![task("tasks/a1.md", "Todo", None)];
    for index in 2..=depth {
        tasks.push(task(
            &format!("tasks/a{index}.md"),
            "Todo",
            Some(&format!("tasks/a{}.md", index - 1)),
        ));
    }

    let map = project(tasks, None);

    assert_eq!(progress_of(&map, "tasks/a1.md").total, depth - 1);
    assert_eq!(progress_of(&map, "tasks/a500.md").total, depth - 500);
    assert_eq!(progress_of(&map, "tasks/a1000.md").total, 0);
}

// ───────── TaskTreeNode の serde 契約 ─────────

/// 生成は `TaskIndex::project_forest` の責務なので、ここは型の serde 契約だけを
/// 固定する（IPC のキー名は FE の codec と 1:1 で、変えると無言で lookup が外れる）。
fn tree_node(file_path: &str, children: Vec<TaskTreeNode>) -> TaskTreeNode {
    TaskTreeNode {
        file_path: file_path.into(),
        children,
    }
}

#[test]
fn task_tree_node_serializes_keys_as_camel_case() {
    let node = tree_node("tasks/parent.md", vec![tree_node("tasks/child.md", vec![])]);

    let value = serde_json::to_value(node).unwrap();

    assert_eq!(value["filePath"], json!("tasks/parent.md"));
    assert_eq!(value["children"][0]["filePath"], json!("tasks/child.md"));
}

#[test]
fn task_tree_node_does_not_serialize_depth() {
    let node = tree_node("tasks/a.md", vec![tree_node("tasks/b.md", vec![])]);

    let value = serde_json::to_value(node).unwrap();

    assert!(
        value.get("depth").is_none(),
        "深さは構造から導出するため payload には載せない"
    );
}

#[test]
fn task_tree_node_without_children_serializes_an_empty_array() {
    let node = tree_node("tasks/leaf.md", vec![]);

    let value = serde_json::to_value(node).unwrap();

    assert_eq!(value["children"], json!([]), "null ではなく空配列で返す");
}
