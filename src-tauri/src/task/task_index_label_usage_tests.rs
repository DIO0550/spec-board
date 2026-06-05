//! `TaskIndex::label_usage_counts` のユニットテスト。
//!
//! 使用タスク件数（タスク単位の重複排除）・完全一致・未正規化を検証する。

use super::{Task, TaskIndex};
use crate::task::label::Label;

fn task_with_labels(id: &str, labels: &[&str]) -> Task {
    Task {
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: labels.iter().map(|l| Label::from(*l)).collect(),
        parent: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

#[test]
fn empty_for_no_tasks() {
    let counts = TaskIndex::label_usage_counts(&[]);
    assert!(counts.is_empty());
}

#[test]
fn counts_tasks_using_each_label() {
    let tasks = vec![
        task_with_labels("a", &["bug"]),
        task_with_labels("b", &["bug", "feat"]),
        task_with_labels("c", &["bug"]),
    ];
    let counts = TaskIndex::label_usage_counts(&tasks);
    assert_eq!(counts.get("bug"), Some(&3));
    assert_eq!(counts.get("feat"), Some(&1));
}

#[test]
fn dedupes_duplicate_label_within_a_task() {
    // 1 タスク内で同じラベルが 2 回出現しても 1 件（タスク単位で数える）。
    let tasks = vec![task_with_labels("a", &["bug", "bug"])];
    let counts = TaskIndex::label_usage_counts(&tasks);
    assert_eq!(counts.get("bug"), Some(&1));
}

#[test]
fn exact_match_is_case_sensitive_and_not_normalized() {
    let tasks = vec![
        task_with_labels("a", &["Bug"]),
        task_with_labels("b", &["bug"]),
    ];
    let counts = TaskIndex::label_usage_counts(&tasks);
    assert_eq!(counts.get("Bug"), Some(&1));
    assert_eq!(counts.get("bug"), Some(&1));
}
