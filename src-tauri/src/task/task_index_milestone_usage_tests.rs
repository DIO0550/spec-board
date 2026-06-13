//! `TaskIndex::milestone_usage_counts` のユニットテスト。
//!
//! 単数 string の 0/1 件展開・未割当の非計上・マスタ未定義値の計上・完全一致を検証する。

use super::{Task, TaskIndex};

fn task_with_milestone(id: &str, milestone: Option<&str>) -> Task {
    Task {
        draft: false,
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: milestone.map(str::to_owned),
        due: None,
        labels: Vec::new(),
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
    let counts = TaskIndex::new(Vec::new()).milestone_usage_counts();
    assert!(counts.is_empty());
}

#[test]
fn counts_tasks_per_milestone_and_ignores_unassigned() {
    let tasks = vec![
        task_with_milestone("a", Some("v0.3")),
        task_with_milestone("b", Some("v0.3")),
        task_with_milestone("c", Some("v0.4")),
        task_with_milestone("d", None),
    ];
    let counts = TaskIndex::new(tasks).milestone_usage_counts();
    assert_eq!(counts.get("v0.3"), Some(&2));
    assert_eq!(counts.get("v0.4"), Some(&1));
    // 未割当は計上しない（キーが存在しない）。
    assert_eq!(counts.len(), 2);
}

#[test]
fn counts_master_undefined_value_by_occurrence() {
    // マスタ未定義の milestone 値も出現名でそのまま計上する（完全一致・未正規化）。
    let tasks = vec![
        task_with_milestone("a", Some("undefined-ms")),
        task_with_milestone("b", Some("undefined-ms")),
    ];
    let counts = TaskIndex::new(tasks).milestone_usage_counts();
    assert_eq!(counts.get("undefined-ms"), Some(&2));
}

#[test]
fn exact_match_is_case_sensitive_and_not_normalized() {
    let tasks = vec![
        task_with_milestone("a", Some("V0.3")),
        task_with_milestone("b", Some("v0.3")),
    ];
    let counts = TaskIndex::new(tasks).milestone_usage_counts();
    assert_eq!(counts.get("V0.3"), Some(&1));
    assert_eq!(counts.get("v0.3"), Some(&1));
}
