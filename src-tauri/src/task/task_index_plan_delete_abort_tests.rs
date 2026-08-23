//! `TaskIndex::plan_delete_abort` の純粋関数ユニットテスト。AppState / TaskIo /
//! fs::* に依存せず、すべて in-memory で完結する。

use std::path::PathBuf;

use super::{Task, TaskIndex};
use crate::task::delete::error::DeleteTaskError;
use crate::task::parse::{task_from_markdown, TaskParseContext};

// ---------------------------------------------------------------------------
// fixture helpers（task_index_clear_children_tests.rs を最小限で踏襲）
// ---------------------------------------------------------------------------

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(input.as_bytes(), &context(path)).unwrap(),
    )
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

// ---------------------------------------------------------------------------
// plan_delete_abort
// ---------------------------------------------------------------------------

#[test]
fn plan_delete_abort_returns_ok_when_no_children() {
    let index = TaskIndex::new(vec![task_without_parent("tasks/p.md")]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(result, Ok(()));
}

#[test]
fn plan_delete_abort_fails_with_direct_child_only_when_grandchildren_exist() {
    // target -> c -> gc というチェーンで target を削除した際、
    // HasChildren.children には c のみが含まれ gc は含まれない。
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
        task_with_parent("tasks/gc.md", "tasks/c.md"),
    ]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c.md")],
        })
    );
}

#[test]
fn plan_delete_abort_returns_ok_for_path_with_no_referrers() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    let result = index.plan_delete_abort("tasks/orphan.md");

    assert_eq!(result, Ok(()));
}

#[test]
fn plan_delete_abort_fails_with_single_direct_child() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c.md")],
        })
    );
}

#[test]
fn plan_delete_abort_fails_with_two_children_in_snapshot_order() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c1.md", "tasks/p.md"),
        task_with_parent("tasks/c2.md", "tasks/p.md"),
    ]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c1.md"), PathBuf::from("tasks/c2.md")],
        })
    );
}

#[test]
fn plan_delete_abort_resolves_normalized_parent_with_dot_slash_prefix() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "./tasks/p.md"),
    ]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c.md")],
        })
    );
}

#[test]
fn plan_delete_abort_resolves_normalized_parent_with_backslash() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks\\p.md"),
    ]);

    let result = index.plan_delete_abort("tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c.md")],
        })
    );
}

#[test]
fn plan_delete_abort_does_not_treat_self_as_own_child() {
    // 削除対象自身が自分自身を parent に持つ異常データでも自己除外される。
    let self_referential = task_with_parent("tasks/p.md", "./tasks/p.md");

    let index = TaskIndex::new(vec![self_referential]);

    let result = index.plan_delete_abort("./tasks/p.md");

    assert_eq!(result, Ok(()));
}

#[test]
fn plan_delete_abort_error_path_field_matches_input() {
    // エラーの `path` フィールドは引数 `deleted_path` をそのまま保持（正規化しない）。
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let result = index.plan_delete_abort("./tasks/p.md");

    assert_eq!(
        result,
        Err(DeleteTaskError::HasChildren {
            path: "./tasks/p.md".to_string(),
            children: vec![PathBuf::from("tasks/c.md")],
        })
    );
}

#[test]
fn plan_delete_abort_display_format_is_locked_down() {
    // 子 1 件
    let index_single = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c1.md", "tasks/p.md"),
    ]);
    let err_single = index_single
        .plan_delete_abort("tasks/p.md")
        .expect_err("should fail with HasChildren");
    assert_eq!(
        err_single.to_string(),
        "task has children: tasks/p.md (children: tasks/c1.md)"
    );

    // 子 2 件
    let index_double = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c1.md", "tasks/p.md"),
        task_with_parent("tasks/c2.md", "tasks/p.md"),
    ]);
    let err_double = index_double
        .plan_delete_abort("tasks/p.md")
        .expect_err("should fail with HasChildren");
    assert_eq!(
        err_double.to_string(),
        "task has children: tasks/p.md (children: tasks/c1.md, tasks/c2.md)"
    );
}
