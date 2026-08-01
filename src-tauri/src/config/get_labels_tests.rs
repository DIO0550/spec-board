//! `get_labels_impl` のユニットテスト。

use std::path::PathBuf;

use super::{get_labels_impl, GetLabelsError, GetLabelsPayload};
use crate::config::{LabelColor, LabelDefinition, LabelGroup, LabelRegistry};
use crate::state::{AppState, AppStateError};
use crate::task::label::Label;
use crate::task::task_index::Task;

fn label(name: &str, color: Option<&str>) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: None,
        group: None,
        color: color.and_then(LabelColor::from_hex),
        updated: None,
    }
}

fn task_with_labels(id: &str, labels: &[&str]) -> Task {
    Task {
        draft: false,
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: labels.iter().map(|l| Label::from(*l)).collect(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

fn set_tasks(state: &AppState, tasks: Vec<Task>) {
    let cache = tasks
        .into_iter()
        .enumerate()
        .map(|(i, t)| (PathBuf::from(format!("{i}.md")), t))
        .collect();
    state.test_replace_tasks(cache).expect("writable");
}

#[test]
fn returns_err_when_no_project_open() {
    let state = AppState::new();
    let err = get_labels_impl(&state).expect_err("labels 未注入時は Err");
    assert_eq!(err, GetLabelsError::NoProjectOpen);
}

#[test]
fn returns_empty_payload_when_registry_is_empty() {
    let state = AppState::new();
    // labels.yml 不在 = 空レジストリでも Ok（暗黙ラベル）。タスクも無いので usage は空。
    state
        .test_replace_labels(Some(LabelRegistry::default()))
        .expect("writable");

    let payload = get_labels_impl(&state).expect("正常系");
    assert!(payload.labels.is_empty());
    assert!(payload.usage_counts.is_empty());
}

#[test]
fn returns_labels_preserving_definition_order() {
    let state = AppState::new();
    let registry = LabelRegistry {
        labels: vec![
            label("zebra", Some("#111111")),
            label("apple", None),
            label("mango", Some("#222222")),
        ],
    };
    state
        .test_replace_labels(Some(registry.clone()))
        .expect("writable");

    let payload = get_labels_impl(&state).expect("正常系");
    assert_eq!(payload.labels, registry.labels);
    let names: Vec<&str> = payload.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["zebra", "apple", "mango"]);
}

#[test]
fn returns_all_fields_in_payload() {
    let state = AppState::new();
    let registry = LabelRegistry {
        labels: vec![LabelDefinition {
            name: "bug".to_string(),
            description: Some("バグ".to_string()),
            group: LabelGroup::from_lenient("type"),
            color: LabelColor::from_hex("#D73A4A"),
            updated: Some("2026-05-30T00:00:00Z".to_string()),
        }],
    };
    state.test_replace_labels(Some(registry)).expect("writable");

    let payload = get_labels_impl(&state).expect("正常系");
    let label = &payload.labels[0];
    assert_eq!(label.name, "bug");
    assert_eq!(label.description.as_deref(), Some("バグ"));
    assert_eq!(label.group.as_ref().map(LabelGroup::as_str), Some("type"));
    assert_eq!(
        label.color.as_ref().map(LabelColor::as_str),
        Some("#D73A4A")
    );
    assert_eq!(label.updated.as_deref(), Some("2026-05-30T00:00:00Z"));
}

#[test]
fn usage_counts_empty_when_no_task_uses_labels() {
    let state = AppState::new();
    state
        .test_replace_labels(Some(LabelRegistry {
            labels: vec![label("bug", None)],
        }))
        .expect("writable");
    set_tasks(&state, Vec::new());

    let payload = get_labels_impl(&state).expect("正常系");
    assert_eq!(payload.usage_counts.get("bug"), None);
}

#[test]
fn usage_counts_counts_matching_task_labels() {
    let state = AppState::new();
    state
        .test_replace_labels(Some(LabelRegistry {
            labels: vec![label("bug", None), label("feat", None)],
        }))
        .expect("writable");
    set_tasks(
        &state,
        vec![
            task_with_labels("a", &["bug"]),
            task_with_labels("b", &["bug", "feat"]),
            task_with_labels("c", &["bug"]),
        ],
    );

    let payload = get_labels_impl(&state).expect("正常系");
    assert_eq!(payload.usage_counts.get("bug"), Some(&3));
    assert_eq!(payload.usage_counts.get("feat"), Some(&1));
}

#[test]
fn duplicate_label_within_task_counts_once() {
    let state = AppState::new();
    state
        .test_replace_labels(Some(LabelRegistry {
            labels: vec![label("bug", None)],
        }))
        .expect("writable");
    set_tasks(&state, vec![task_with_labels("a", &["bug", "bug"])]);

    let payload = get_labels_impl(&state).expect("正常系");
    assert_eq!(payload.usage_counts.get("bug"), Some(&1));
}

#[test]
fn implicit_label_appears_in_counts_not_in_labels() {
    let state = AppState::new();
    // registry には bug のみ定義。タスクは registry 未定義の "impl" を使う。
    state
        .test_replace_labels(Some(LabelRegistry {
            labels: vec![label("bug", None)],
        }))
        .expect("writable");
    set_tasks(&state, vec![task_with_labels("a", &["impl"])]);

    let payload = get_labels_impl(&state).expect("正常系");
    // 暗黙ラベルは usage_counts に現れるが labels には現れない。
    assert_eq!(payload.usage_counts.get("impl"), Some(&1));
    let names: Vec<&str> = payload.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["bug"]);
}

#[test]
fn payload_separates_labels_and_usage_counts() {
    // payload 型は labels（定義）と usage_counts（派生値）を別フィールドで持つ。
    let payload = GetLabelsPayload {
        labels: vec![label("bug", None)],
        usage_counts: [("bug".to_string(), 2usize)].into_iter().collect(),
    };
    assert_eq!(payload.labels.len(), 1);
    assert_eq!(payload.usage_counts.get("bug"), Some(&2));
}

#[test]
fn state_lock_poisoned_display_matches_contract() {
    assert_eq!(
        GetLabelsError::StateLockPoisoned.to_string(),
        "内部状態のロックが破損しました"
    );
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        GetLabelsError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let err: GetLabelsError = AppStateError::LockPoisoned.into();
    assert_eq!(err, GetLabelsError::StateLockPoisoned);
}
