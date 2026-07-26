//! Task 集合から導出される projection 型。
//!
//! `Task` entity の属性ではない導出値（子孫進捗・完了判定・直接子）を entity に
//! 混ぜず、IPC payload 上で並列に返すための型を置く。生成ロジックは aggregate
//! （`TaskIndex::project_all`）に閉じ、この module は型と serde 契約のみを持つ。
//!
//! # 拡張余地
//!
//! milestone progress は `TaskProjection` にフィールドを追加する形で合流させる。
//! projection の map 構造（filePath -> projection）は変えない。

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
    /// `AppState::tasks_snapshot()`（`HashMap::values()`）由来で順序が非決定的な
    /// ため、明示的に整列しないと payload が実行ごとに揺れる。
    ///
    /// **値の契約**: 親が frontmatter に書いた raw な参照文字列ではなく、
    /// **解決先 task 自身の `file_path`** を入れる。FE はこの値を
    /// `TaskProjectionMap` のキーおよび allTasks の filePath と突き合わせて解決する
    /// ため、raw ref（`./tasks/a.md` のような表記揺れ）を入れると子が無言で落ちる。
    pub child_file_paths: Vec<TaskFilePath>,
}

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
