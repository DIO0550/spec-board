//! `Task::preserve_parent_cycle_state` の単体テスト。
//!
//! scan で cycle member と判定された task の正規化状態（parent=None +
//! parentCycle warning）を、effect 層の cache 差分更新でどう引き継ぐかを
//! ドメイン側で 1 箇所に集約したメソッドの振る舞いを検証する。

use std::path::PathBuf;

use super::Task;
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::warning::{ensure_parent_cycle_warning, TaskWarningCode};

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_with_parent(parent: Option<&str>) -> Task {
    let mut markdown = String::from("---\ntitle: Task\nstatus: Todo\n");
    if let Some(parent) = parent {
        markdown.push_str(&format!("parent: {parent}\n"));
    }
    markdown.push_str("---\n");
    task_from_markdown(markdown.as_bytes(), &context("tasks/a.md")).unwrap()
}

fn has_cycle_warning(task: &Task) -> bool {
    task.warnings
        .iter()
        .any(|w| w.code == TaskWarningCode::ParentCycle && w.field.as_deref() == Some("parent"))
}

#[test]
fn preserves_parent_none_and_warning_when_was_cycle_member() {
    let mut task = task_with_parent(Some("tasks/b.md"));

    task.preserve_parent_cycle_state(true, false);

    assert!(
        task.parent.is_none(),
        "cycle member の parent は None 化される"
    );
    assert!(has_cycle_warning(&task), "parentCycle warning が付与される");
}

#[test]
fn does_nothing_when_not_cycle_member() {
    let mut task = task_with_parent(Some("tasks/b.md"));

    task.preserve_parent_cycle_state(false, false);

    assert_eq!(
        task.parent.as_ref().map(|p| p.as_str()),
        Some("tasks/b.md"),
        "非 cycle member の parent はそのまま"
    );
    assert!(!has_cycle_warning(&task), "warning は付与されない");
}

#[test]
fn does_not_duplicate_warning_when_already_present() {
    let mut task = task_with_parent(None);
    ensure_parent_cycle_warning(&mut task.warnings);

    task.preserve_parent_cycle_state(true, false);

    let cycle_count = task
        .warnings
        .iter()
        .filter(|w| w.code == TaskWarningCode::ParentCycle)
        .count();
    assert_eq!(cycle_count, 1, "parentCycle warning は重複しない");
}

#[test]
fn drops_preservation_when_parent_absent_and_flag_set() {
    let mut task = task_with_parent(None);

    task.preserve_parent_cycle_state(true, true);

    assert!(task.parent.is_none());
    assert!(
        !has_cycle_warning(&task),
        "parent が None かつ drop フラグ有効なら循環解消とみなし warning を付けない"
    );
}

#[test]
fn keeps_preservation_when_parent_present_even_with_flag() {
    let mut task = task_with_parent(Some("tasks/b.md"));

    task.preserve_parent_cycle_state(true, true);

    assert!(
        task.parent.is_none(),
        "parent が Some なら drop フラグ有効でも None 化"
    );
    assert!(has_cycle_warning(&task), "warning も付与される");
}

#[test]
fn does_not_inject_warning_into_non_member_even_with_flag() {
    let mut task = task_with_parent(Some("tasks/b.md"));

    task.preserve_parent_cycle_state(false, true);

    assert_eq!(task.parent.as_ref().map(|p| p.as_str()), Some("tasks/b.md"));
    assert!(!has_cycle_warning(&task));
}
