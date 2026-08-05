//! `TaskIndex::plan_move` の純粋関数ユニットテスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::collections::BTreeMap;
use std::path::PathBuf;

use super::{MoveTaskIntent, MoveTaskOutcome, Task, TaskIndex};
use crate::config::column_name::ColumnName;
use crate::config::{CardOrder, Config};
use crate::task::frontmatter::{parse as parse_frontmatter, Parsed, Priority};
use crate::task::label::Label;
use crate::task::move_task::error::MoveTaskError;
use crate::task::task_file_path::TaskFilePath;

fn make_task(file_path: &str, status: &str) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        draft: false,
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: ColumnName::from_lenient(status),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: BTreeMap::new(),
        warnings: Vec::new(),
    }
}

fn parsed_from_md(md: &str) -> Parsed {
    parse_frontmatter(md).expect("parse ok").expect("some")
}

/// scan 時に status 欠落 / 非文字列の md へ割り当てられる既定 status。
/// 既定値の決定は Config のドメインなので、aggregate へは解決済みの値が渡る。
const DEFAULT_STATUS: &str = "Todo";

fn intent(rel: &str, from: &str, to: &str) -> MoveTaskIntent {
    intent_expecting(rel, from, to, &[])
}

fn intent_expecting(rel: &str, from: &str, to: &str, expected: &[&str]) -> MoveTaskIntent {
    MoveTaskIntent {
        file_path: PathBuf::from(rel),
        from_column: from.to_string(),
        to_column: to.to_string(),
        to_column_file_paths: Vec::new(),
        expected_to_column_order: expected.iter().map(|s| s.to_string()).collect(),
    }
}

/// cardOrder エントリだけを差し替えた Config を作る。
///
/// `plan_move` が config から読むのは cardOrder のみ（board 表示順の算出に使う）。
fn config_with_card_order(entries: &[(&str, &[&str])]) -> Config {
    let mut order = CardOrder::default();
    for (column, paths) in entries {
        order.set_column(column, paths);
    }
    Config {
        card_order: order,
        ..Config::default()
    }
}

#[test]
fn cross_column_move_updates_status_to_destination_column() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn { updated_task, .. } => {
            assert_eq!(updated_task.status.as_str(), "Done");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn same_column_move_returns_same_column_outcome_without_touching_task() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Todo", &["tasks/a.md"]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::SameColumn { existing_task } => {
            assert_eq!(existing_task, task);
        }
        other => panic!("expected SameColumn, got {other:?}"),
    }
}

#[test]
fn cross_column_move_writes_destination_status_into_file_content() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn { file_content, .. } => {
            assert!(file_content.contains("status: Done"), "{file_content}");
            assert!(!file_content.contains("status: Todo"), "{file_content}");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn cross_column_move_preserves_non_status_fields() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\npriority: High\nlabels:\n  - bug\n---\nsome body\n",
    );
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn {
            updated_task,
            file_content,
        } => {
            assert_eq!(updated_task.title.as_str(), "A");
            assert_eq!(updated_task.priority, Some(Priority::High));
            assert_eq!(
                updated_task
                    .labels
                    .iter()
                    .map(Label::as_str)
                    .collect::<Vec<_>>(),
                vec!["bug"]
            );
            assert!(updated_task.body.contains("some body"));
            assert!(file_content.contains("title: A"), "{file_content}");
            assert!(file_content.contains("some body"), "{file_content}");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn cross_column_move_preserves_unknown_frontmatter_keys() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nassignee: alice\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn {
            updated_task,
            file_content,
        } => {
            assert_eq!(
                updated_task.extras.get("assignee"),
                Some(&serde_json::Value::String("alice".to_string()))
            );
            assert!(file_content.contains("assignee: alice"), "{file_content}");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn minimal_frontmatter_without_body_is_movable() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: X\nstatus: Todo\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn { updated_task, .. } => {
            assert_eq!(updated_task.status.as_str(), "Done");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn column_name_containing_space_is_moved_as_is() {
    let task = make_task("tasks/a.md", "In Progress");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: In Progress\n---\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "In Progress", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn {
            updated_task,
            file_content,
        } => {
            assert_eq!(updated_task.status.as_str(), "Done");
            assert!(file_content.contains("status: Done"), "{file_content}");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn status_mismatch_is_rejected() {
    let task = make_task("tasks/a.md", "In Progress");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: In Progress\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("stale from_column should be rejected");

    assert_eq!(
        err,
        MoveTaskError::StatusMismatch {
            expected: "Todo".to_string(),
            actual: "In Progress".to_string(),
        }
    );
}

#[test]
fn status_changed_on_disk_after_last_scan_is_rejected() {
    // cache は Todo のままだが、watcher が追いつく前に disk 上で status が
    // 書き換えられている状況。cache だけを見ていると外部変更を握り潰して上書きする。
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: In Progress\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("disk 上の status 変更は拒否されるべき");

    assert_eq!(
        err,
        MoveTaskError::StatusMismatch {
            expected: "Todo".to_string(),
            actual: "In Progress".to_string(),
        }
    );
}

#[test]
fn frontmatter_without_status_key_is_compared_against_the_scan_default() {
    // status キーが無い md の実効 status は scan 時と同じ既定値。既定値と移動元カラムが
    // 一致していれば通す。
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let outcome = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("plan_move should succeed");

    match outcome {
        MoveTaskOutcome::CrossColumn { updated_task, .. } => {
            assert_eq!(updated_task.status.as_str(), "Done");
        }
        other => panic!("expected CrossColumn, got {other:?}"),
    }
}

#[test]
fn status_key_removed_on_disk_is_rejected_when_default_differs_from_cache() {
    // cache は In Progress のままだが、外部編集で status キー自体が削除されている。
    // この md の実効 status は既定値（Todo）なので、In Progress からの移動として
    // 通してしまうと外部変更を握り潰して上書きすることになる。
    let task = make_task("tasks/a.md", "In Progress");
    let parsed = parsed_from_md("---\ntitle: A\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent("tasks/a.md", "In Progress", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("status キー削除は拒否されるべき");

    assert_eq!(
        err,
        MoveTaskError::StatusMismatch {
            expected: "In Progress".to_string(),
            actual: "Todo".to_string(),
        }
    );
}

#[test]
fn non_string_status_on_disk_is_rejected_when_default_differs_from_cache() {
    // status が非文字列（数値）の md も scan では既定値が割り当てられる。
    let task = make_task("tasks/a.md", "In Progress");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: 123\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent("tasks/a.md", "In Progress", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("非文字列 status は拒否されるべき");

    assert_eq!(
        err,
        MoveTaskError::StatusMismatch {
            expected: "In Progress".to_string(),
            actual: "Todo".to_string(),
        }
    );
}

#[test]
fn destination_with_an_extra_task_is_rejected_as_card_order_conflict() {
    // FE が見た後に宛先カラムへ別のタスクが増えている。そのまま確定すると
    // FE の完成品の並びが増えたカードを消したように見える。
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/x.md", "Done")]);

    let err = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Done", &[]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("宛先にカードが増えていたら拒否されるべき");

    assert_eq!(
        err,
        MoveTaskError::CardOrderConflict {
            column: "Done".to_string(),
            expected: Vec::new(),
            actual: vec!["tasks/x.md".to_string()],
        }
    );
}

#[test]
fn destination_with_a_missing_task_is_rejected_as_card_order_conflict() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Done", &["tasks/x.md"]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("宛先からカードが消えていたら拒否されるべき");

    assert_eq!(
        err,
        MoveTaskError::CardOrderConflict {
            column: "Done".to_string(),
            expected: vec!["tasks/x.md".to_string()],
            actual: Vec::new(),
        }
    );
}

#[test]
fn destination_with_reordered_tasks_is_rejected_as_card_order_conflict() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![
        task.clone(),
        make_task("tasks/x.md", "Done"),
        make_task("tasks/y.md", "Done"),
    ]);
    let config = config_with_card_order(&[("Done", &["tasks/y.md", "tasks/x.md"])]);

    let err = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Done", &["tasks/x.md", "tasks/y.md"]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &config,
        )
        .expect_err("宛先の順序が入れ替わっていたら拒否されるべき");

    assert!(
        matches!(err, MoveTaskError::CardOrderConflict { .. }),
        "unexpected error: {err:?}"
    );
}

#[test]
fn matching_expectation_allows_the_cross_column_move() {
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/x.md", "Done")]);

    let outcome = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Done", &["tasks/x.md"]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect("期待値が現実と一致していれば成功する");

    assert!(matches!(outcome, MoveTaskOutcome::CrossColumn { .. }));
}

#[test]
fn same_column_move_with_stale_expectation_is_rejected() {
    // 同一カラム並び替えでも照合する。宛先＝移動元なので、期待値には移動前の
    // 自分自身を含む並びが載っているはずである。
    let task = make_task("tasks/a.md", "Todo");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Todo", &[]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("同一カラムでも stale な期待値は拒否されるべき");

    assert!(
        matches!(err, MoveTaskError::CardOrderConflict { .. }),
        "unexpected error: {err:?}"
    );
}

#[test]
fn status_mismatch_takes_precedence_over_card_order_conflict() {
    // status 照合 → 並び照合の順。両方が食い違う場合は先に StatusMismatch が返り、
    // FE のトーストが「状態が変わった」ことを指す。
    let task = make_task("tasks/a.md", "In Progress");
    let parsed = parsed_from_md("---\ntitle: A\nstatus: In Progress\n---\nbody\n");
    let index = TaskIndex::new(vec![task.clone(), make_task("tasks/x.md", "Done")]);

    let err = index
        .plan_move(
            &intent_expecting("tasks/a.md", "Todo", "Done", &[]),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("status と並びの両方が食い違う場合も拒否されるべき");

    assert!(
        matches!(err, MoveTaskError::StatusMismatch { .. }),
        "unexpected error: {err:?}"
    );
}

#[test]
fn content_that_would_exceed_the_scanner_limit_is_rejected() {
    // status を書き換えた結果 scanner の受理上限を超えると、移動は成功したのに
    // 次の再スキャンで task が消える。書き込み前に aggregate 側で弾く。
    let task = make_task("tasks/a.md", "Todo");
    let huge_body = "x".repeat(1024 * 1024);
    let parsed = parsed_from_md(&format!("---\ntitle: A\nstatus: Todo\n---\n{huge_body}"));
    let index = TaskIndex::new(vec![task.clone()]);

    let err = index
        .plan_move(
            &intent("tasks/a.md", "Todo", "Done"),
            &task,
            parsed,
            DEFAULT_STATUS,
            &Config::default(),
        )
        .expect_err("scanner の受理上限を超える content は拒否されるべき");

    assert!(
        matches!(err, MoveTaskError::ContentNotScannerEligible { .. }),
        "unexpected error: {err:?}"
    );
}
