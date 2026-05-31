//! `get_labels_impl` のユニットテスト。

use super::{get_labels_impl, GetLabelsError, GetLabelsPayload};
use crate::config::{LabelColor, LabelDefinition, LabelRegistry};
use crate::state::{AppState, AppStateError};

fn label(name: &str, color: Option<&str>) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: None,
        group: None,
        color: color.and_then(LabelColor::from_hex),
        updated: None,
    }
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
    // labels.yml 不在 = 空レジストリでも Ok（暗黙ラベル）
    state
        .replace_labels(Some(LabelRegistry::default()))
        .expect("writable");

    let payload = get_labels_impl(&state).expect("正常系");
    assert_eq!(payload, GetLabelsPayload { labels: vec![] });
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
        .replace_labels(Some(registry.clone()))
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
            group: Some("type".to_string()),
            color: LabelColor::from_hex("#D73A4A"),
            updated: Some("2026-05-30T00:00:00Z".to_string()),
        }],
    };
    state.replace_labels(Some(registry)).expect("writable");

    let payload = get_labels_impl(&state).expect("正常系");
    let label = &payload.labels[0];
    assert_eq!(label.name, "bug");
    assert_eq!(label.description.as_deref(), Some("バグ"));
    assert_eq!(label.group.as_deref(), Some("type"));
    assert_eq!(
        label.color.as_ref().map(LabelColor::as_str),
        Some("#D73A4A")
    );
    assert_eq!(label.updated.as_deref(), Some("2026-05-30T00:00:00Z"));
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
