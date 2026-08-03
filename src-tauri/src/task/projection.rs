//! Task 集合から導出される projection 型。
//!
//! `Task` entity の属性ではない導出値を entity に混ぜず、IPC payload 上で
//! 並列に返すための型を置く。task 単位の子孫進捗と milestone 単位の進捗は
//! 異なる key・更新単位を持つため、独立した deterministic map として表現する。
//! 生成ロジックは aggregate（`TaskIndex`）に閉じ、この module は型と serde
//! 契約のみを持つ。

use std::collections::BTreeMap;

use serde::Serialize;

use crate::task::task_file_path::TaskFilePath;

/// 子孫タスクの完了数 / 総数。百分率は FE の表示層で算出するため持たない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubIssueProgress {
    pub done: usize,
    pub total: usize,
}

/// 1 タスク分の projection。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProjection {
    /// 全子孫（root 自身は含まない）の完了数 / 総数。
    pub sub_issue_progress: SubIssueProgress,
    /// このタスク自身が完了カラムに居るか。done column 未解決時は常に false。
    pub is_done: bool,
    /// 直接の子（`parent` がこの task を指す task）の filePath。
    ///
    /// **並び順の契約**: `file_path` 昇順。`Task.children` の順序にも
    /// `TaskIndex.tasks` の順序にも依存しない。`tasks` は
    /// `HashMap::values()` 由来で順序が非決定的な
    /// ため、明示的に整列しないと payload が実行ごとに揺れる。
    /// 同じ「直接の子」を運ぶ [`TaskTreeNode::children`] は **board 表示順**で
    /// 契約が異なるので、順序に依存する処理では取り違えないこと。
    ///
    /// **値の契約**: 親が frontmatter に書いた raw な参照文字列ではなく、
    /// **解決先 task 自身の `file_path`** を入れる。FE はこの値を
    /// `TaskProjectionMap` のキーおよび allTasks の filePath と突き合わせて解決する
    /// ため、raw ref（`./tasks/a.md` のような表記揺れ）を入れると子が無言で落ちる。
    pub child_file_paths: Vec<TaskFilePath>,
}

/// タスク階層ツリーの 1 ノード。
///
/// **値の契約**: `file_path` は親が frontmatter に書いた raw な参照文字列ではなく、
/// **解決先 task 自身の `file_path`**（`TaskProjection::child_file_paths` と同じ規約）。
/// FE はこの値をそのまま `Task.file_path` と突き合わせて lookup する。
///
/// **深さを持たない理由**: ネスト表現では深さは構造から自明で、`depth` を載せると
/// 「構造と値が矛盾した payload」が表現可能になる。FE は親から `depth + 1` を渡す。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTreeNode {
    pub file_path: TaskFilePath,
    /// 直接の子。
    ///
    /// **並び順の契約**: 生成元 `TaskIndex` の入力順（= board 表示順）。
    /// `TaskProjection::child_file_paths` は **`file_path` 昇順**で契約が異なる。
    /// 同じ「直接の子」を 2 つの順序で運ぶため、消費者は用途で使い分けること
    /// （board カードの子カウント = projection / ツリー描画 = こちら）。
    pub children: Vec<TaskTreeNode>,
}

/// 階層ツリーの root ノード列。
///
/// **並び順の契約**: board 表示順。閉じた親循環のメンバも root として現れるが、
/// 末尾送りにはせず board 順の自分の位置に入る（root 列に例外規則を作らない）。
///
/// **集合の契約**: 生成元 `TaskIndex` の全 task がちょうど 1 回ずつ出現する。
/// root になるのは「親を持たない task」と「閉路そのもののメンバ」だけで、
/// 閉路にぶら下がる子孫は親配下に残る（`mark_cycle_members` と同じ木の形）。
pub type TaskForest = Vec<TaskTreeNode>;

/// 1 milestone 分の task 件数・完了件数・所属 task path。
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneProjection {
    pub done: usize,
    pub total: usize,
    /// 集計元 `TaskIndex` の入力順を保つ raw `Task.file_path`。
    pub task_file_paths: Vec<TaskFilePath>,
}

/// milestone 名（frontmatter の raw 値）→ projection の deterministic map。
pub type MilestoneProjectionMap = BTreeMap<String, MilestoneProjection>;

/// filePath（`Task.file_path` の raw 値。正規化はしない）→ projection の map。
///
/// `HashMap` ではなく `BTreeMap` を使うのは、JSON のキー順を固定してテスト期待値を
/// 決定的にするため（`Task.extras` と同じ判断）。同じ「導出値の map」でも
/// `GetLabelsPayload.usage_counts` / `GetMilestonesPayload.usage_counts` は
/// `HashMap` だが、あちらは順序を観測しないカウント map。
pub type TaskProjectionMap = BTreeMap<String, TaskProjection>;

#[cfg(test)]
#[path = "projection_tests.rs"]
mod projection_tests;
