//! `TaskIndex::project_forest` の階層構築規則のテスト。
//!
//! 検証する契約は 4 つ。
//!
//! 1. 全 task がちょうど 1 回だけ forest に現れる（重複も欠落もない）
//! 2. root 列・兄弟列とも `TaskIndex` の入力順（command 層が渡す board 表示順）
//! 3. root になるのは「親を持たない task」と「閉路そのもののメンバ」だけで、
//!    閉路にぶら下がる子孫は親配下に残る
//! 4. 親循環・自己参照・親不在があっても停止し、深いチェーンでもスタックを溢れさせない
//!
//! FE `features/board/lib/buildTaskTree` から移植したケースには移植元を明記する。

use std::collections::HashSet;
use std::path::PathBuf;

use super::{Task, TaskIndex};
use crate::config::{CardOrder, Column, Config};
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::projection::{TaskForest, TaskTreeNode};

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

/// forest を「入力順に依存しない比較」ではなく、そのままの並びで検証するための平坦化。
/// 返す `Vec` は preorder（root → 子 → 孫）。
fn preorder_file_paths(forest: &TaskForest) -> Vec<String> {
    let mut result = Vec::new();
    let mut stack: Vec<&TaskTreeNode> = forest.iter().rev().collect();
    while let Some(node) = stack.pop() {
        result.push(node.file_path.as_str().to_owned());
        stack.extend(node.children.iter().rev());
    }
    result
}

fn root_file_paths(forest: &TaskForest) -> Vec<String> {
    forest
        .iter()
        .map(|node| node.file_path.as_str().to_owned())
        .collect()
}

fn child_file_paths(node: &TaskTreeNode) -> Vec<String> {
    node.children
        .iter()
        .map(|child| child.file_path.as_str().to_owned())
        .collect()
}

/// 深いネストを持つ forest を、`children` を空にした平坦な `Vec` へ移し替える。
///
/// `TaskTreeNode` の `Drop` はネスト構造を再帰的に辿るため、10,000 段の forest を
/// そのままスコープ外へ落とすとテストスレッドのスタックが溢れる。深さ保証の対象は
/// 「BE の構築」と「FE の走査」であって `Drop` ではない、という計画上の線引きに
/// 合わせ、深さ検証のテストだけこの helper で先に解体する。
fn drain_nodes(forest: TaskForest) -> Vec<TaskTreeNode> {
    let mut flat = Vec::new();
    let mut stack = forest;
    while let Some(mut node) = stack.pop() {
        stack.append(&mut node.children);
        flat.push(node);
    }
    flat
}

fn task_with_status_and_parent(path: &str, status: &str, parent: Option<&str>) -> Task {
    let mut source = format!("---\ntitle: Task\nstatus: {status}\n");
    if let Some(parent) = parent {
        source.push_str(&format!("parent: {parent}\n"));
    }
    source.push_str("---\n");
    task_from(&source, path)
}

fn board_config(columns: &[&str], card_order: &[(&str, &[&str])]) -> Config {
    let mut order = CardOrder::default();
    for (column, paths) in card_order {
        order.set_column(column, paths);
    }
    Config::new(
        columns
            .iter()
            .enumerate()
            .map(|(index, name)| Column {
                name: (*name).into(),
                order: index as u32,
                color: None,
                wip_limit: None,
            })
            .collect(),
        order,
        None,
    )
}

/// command 層と同じ手順（board 順に整列してから `TaskIndex` を組み直す）で forest を作る。
fn forest_in_board_order(tasks: Vec<Task>, config: &Config) -> TaskForest {
    let ordered = TaskIndex::new(tasks).sorted_by_board_order(config);
    TaskIndex::new(ordered).project_forest()
}

#[test]
fn tasks_without_parent_all_become_roots() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("tasks/b.md"),
        task_without_parent("tasks/c.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md", "tasks/b.md", "tasks/c.md"],
        "親を持たない task は入力順のまま root に並ぶ"
    );
    assert!(
        forest.iter().all(|node| node.children.is_empty()),
        "子を持たない root の children は空"
    );
}

#[test]
fn child_task_is_nested_under_its_parent() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md"],
        "子は root 列に現れない"
    );
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/b.md"],
        "子は親ノードの children に入る"
    );
}

#[test]
fn multi_level_chain_becomes_nested_structure() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
        task_with_parent("tasks/c.md", "tasks/b.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(root_file_paths(&forest), vec!["tasks/a.md"]);
    assert_eq!(child_file_paths(&forest[0]), vec!["tasks/b.md"]);
    assert_eq!(
        child_file_paths(&forest[0].children[0]),
        vec!["tasks/c.md"],
        "3 段目もそのままネストする"
    );
}

// ───────── 並び順（root 列・兄弟列とも board 表示順） ─────────

#[test]
fn siblings_follow_board_order_not_file_path_order() {
    let config = board_config(
        &["Todo"],
        &[("Todo", &["tasks/a.md", "tasks/z.md", "tasks/b.md"])],
    );
    let tasks = vec![
        task_with_status_and_parent("tasks/a.md", "Todo", None),
        task_with_status_and_parent("tasks/b.md", "Todo", Some("tasks/a.md")),
        task_with_status_and_parent("tasks/z.md", "Todo", Some("tasks/a.md")),
    ];

    let forest = forest_in_board_order(tasks, &config);

    assert_eq!(root_file_paths(&forest), vec!["tasks/a.md"]);
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/z.md", "tasks/b.md"],
        "兄弟は file_path 昇順ではなく cardOrder 由来の board 順で並ぶ"
    );
}

#[test]
fn siblings_across_columns_follow_column_order() {
    let config = board_config(&["Todo", "Doing"], &[]);
    let tasks = vec![
        task_with_status_and_parent("tasks/a-doing.md", "Doing", Some("tasks/parent.md")),
        task_with_status_and_parent("tasks/parent.md", "Todo", None),
        task_with_status_and_parent("tasks/z-todo.md", "Todo", Some("tasks/parent.md")),
    ];

    let forest = forest_in_board_order(tasks, &config);

    assert_eq!(root_file_paths(&forest), vec!["tasks/parent.md"]);
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/z-todo.md", "tasks/a-doing.md"],
        "並び順契約の第 1 キー（カラム表示順）が兄弟順にも効く"
    );
}

#[test]
fn roots_follow_board_order() {
    let config = board_config(
        &["Todo", "Done"],
        &[("Todo", &["tasks/c.md", "tasks/a.md"])],
    );
    let tasks = vec![
        task_with_status_and_parent("tasks/a.md", "Todo", None),
        task_with_status_and_parent("tasks/z.md", "Done", None),
        task_with_status_and_parent("tasks/c.md", "Todo", None),
    ];

    let forest = forest_in_board_order(tasks, &config);

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/c.md", "tasks/a.md", "tasks/z.md"],
        "root 列は tasks と同じ board 表示順"
    );
}

#[test]
fn child_placed_before_its_parent_does_not_appear_as_root() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/child.md", "tasks/parent.md"),
        task_without_parent("tasks/parent.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/parent.md"],
        "board 順で子が親より前でも root には出ない"
    );
    assert_eq!(child_file_paths(&forest[0]), vec!["tasks/child.md"]);
}

#[test]
fn wide_forest_keeps_every_child_exactly_once() {
    let child_count = 10_000;
    let mut tasks = vec![task_without_parent("tasks/parent.md")];
    for index in 0..child_count {
        tasks.push(task_with_parent(
            &format!("tasks/child-{index:05}.md"),
            "tasks/parent.md",
        ));
    }

    let forest = TaskIndex::new(tasks).project_forest();

    assert_eq!(forest.len(), 1);
    assert_eq!(forest[0].children.len(), child_count);
    assert_eq!(preorder_file_paths(&forest).len(), child_count + 1);
}

// ───────── 境界値 ─────────

#[test]
fn empty_task_set_yields_empty_forest() {
    let forest = TaskIndex::new(Vec::new()).project_forest();

    assert!(forest.is_empty());
}

#[test]
fn single_task_becomes_single_root_without_children() {
    let forest = TaskIndex::new(vec![task_without_parent("tasks/only.md")]).project_forest();

    assert_eq!(root_file_paths(&forest), vec!["tasks/only.md"]);
    assert!(forest[0].children.is_empty());
}

#[test]
fn deep_chain_does_not_overflow_the_call_stack() {
    let depth = 10_000;
    let mut tasks = vec![task_without_parent("tasks/node-00000.md")];
    for index in 1..depth {
        tasks.push(task_with_parent(
            &format!("tasks/node-{index:05}.md"),
            &format!("tasks/node-{:05}.md", index - 1),
        ));
    }

    let forest = TaskIndex::new(tasks).project_forest();

    assert_eq!(forest.len(), 1, "1 本鎖なので root は 1 件");
    assert_eq!(
        drain_nodes(forest).len(),
        depth,
        "反復 DFS なので 10,000 段でも全 task が組み上がる"
    );
}

// ───────── 異常系・エッジケース（親不在 / 表記揺れ） ─────────

#[test]
fn task_with_missing_parent_becomes_root() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/orphan.md", "tasks/missing.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md", "tasks/orphan.md"],
        "解決できない親を持つ task は root 扱い"
    );
}

#[test]
fn parent_reference_with_dot_slash_prefix_resolves_to_the_same_task() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "./tasks/a.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(root_file_paths(&forest), vec!["tasks/a.md"]);
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/b.md"],
        "`./` 付きの表記揺れは正規化して解決する"
    );
}

#[test]
fn colon_terminated_segment_is_kept_because_only_drive_letters_are_stripped() {
    let index = TaskIndex::new(vec![
        task_without_parent("notes:/x.md"),
        task_with_parent("tasks/b.md", "notes:/x.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(root_file_paths(&forest), vec!["notes:/x.md"]);
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/b.md"],
        "drive prefix と見なすのは ASCII 1 文字 + `:` だけなので `notes:` セグメントは落ちない"
    );
}

// ───────── 循環（打ち切りと救済） ─────────

#[test]
fn self_referencing_task_becomes_root_without_children() {
    let index = TaskIndex::new(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);

    let forest = index.project_forest();

    assert_eq!(root_file_paths(&forest), vec!["tasks/a.md"]);
    assert!(
        forest[0].children.is_empty(),
        "自己参照 edge は隣接に載らないので自分の子にならない"
    );
}

#[test]
fn two_node_cycle_emits_both_members_as_roots() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md", "tasks/b.md"],
        "閉路メンバは全員 root"
    );
    assert!(forest.iter().all(|node| node.children.is_empty()));
}

#[test]
fn three_node_cycle_terminates_and_emits_each_member_once() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/c.md"),
        task_with_parent("tasks/c.md", "tasks/a.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        preorder_file_paths(&forest),
        vec!["tasks/a.md", "tasks/b.md", "tasks/c.md"],
        "3 者循環でも停止し 3 件が 1 回ずつ現れる"
    );
    assert_eq!(forest.len(), 3);
}

#[test]
fn cycle_with_a_missing_member_behaves_as_plain_parent_child() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/c.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/b.md"],
        "親参照が解決しない側が自然 root になる"
    );
    assert_eq!(child_file_paths(&forest[0]), vec!["tasks/a.md"]);
}

#[test]
fn cycle_members_keep_their_board_order_position_in_the_root_list() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
        task_without_parent("tasks/r.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md", "tasks/b.md", "tasks/r.md"],
        "循環救済 root は末尾送りにせず board 順の自分の位置に入る"
    );
}

#[test]
fn descendants_of_a_cycle_stay_under_their_parent() {
    let index = TaskIndex::new(vec![
        task_with_parent("tasks/x.md", "tasks/a.md"),
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    let forest = index.project_forest();

    assert_eq!(
        root_file_paths(&forest),
        vec!["tasks/a.md", "tasks/b.md"],
        "root になるのは閉路メンバだけ"
    );
    assert_eq!(
        child_file_paths(&forest[0]),
        vec!["tasks/x.md"],
        "board 順で先にいても閉路の子孫は root へ持ち上がらない"
    );
}

#[test]
fn forest_shape_matches_between_scan_and_watcher_paths() {
    let cyclic_tasks = || {
        vec![
            task_with_parent("tasks/a.md", "tasks/b.md"),
            task_with_parent("tasks/b.md", "tasks/a.md"),
            task_with_parent("tasks/x.md", "tasks/a.md"),
        ]
    };

    let watcher_forest = TaskIndex::new(cyclic_tasks()).project_forest();
    let scan_forest = TaskIndex::new(cyclic_tasks())
        .build_children_with_warnings()
        .unwrap()
        .project_forest();

    assert_eq!(
        watcher_forest, scan_forest,
        "mark_cycle_members 適用の有無で描画される木の形が変わらない"
    );
}

#[test]
fn project_forest_is_idempotent() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
        task_with_parent("tasks/c.md", "tasks/d.md"),
    ]);

    assert_eq!(index.project_forest(), index.project_forest());
}

#[test]
fn forest_node_set_matches_the_task_set() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/root.md"),
        task_with_parent("tasks/child.md", "tasks/root.md"),
        task_with_parent("tasks/orphan.md", "tasks/missing.md"),
        task_with_parent("tasks/cycle-a.md", "tasks/cycle-b.md"),
        task_with_parent("tasks/cycle-b.md", "tasks/cycle-a.md"),
        task_with_parent("tasks/under-cycle.md", "tasks/cycle-a.md"),
    ]);

    let forest = index.project_forest();

    let emitted = preorder_file_paths(&forest);
    let unique: HashSet<&String> = emitted.iter().collect();
    assert_eq!(emitted.len(), 6, "全 task が出現する");
    assert_eq!(unique.len(), emitted.len(), "重複して出現しない");
}
