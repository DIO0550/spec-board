//! `update_label_impl` / `LabelRegistry::plan_update_label` のテスト。

use std::path::Path;

use tempfile::TempDir;

use super::{update_label_impl, UpdateLabelArgs, UpdateLabelError};
use crate::config::clock::FixedClock;
use crate::config::{
    label_registry_store, LabelColor, LabelDefinition, LabelGroup, LabelRegistry,
    LabelRegistryStore, UpdateLabelIntent, UpdateLabelPlanError,
};
use crate::state::{AppState, AppStateError};

const FIXED_NOW: &str = "2026-05-31T12:00:00Z";

fn fixed_clock() -> FixedClock {
    FixedClock::new(FIXED_NOW)
}

fn label(
    name: &str,
    description: Option<&str>,
    group: Option<&str>,
    color: Option<&str>,
) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: description.map(str::to_string),
        group: group.and_then(LabelGroup::from_lenient),
        color: color.and_then(LabelColor::from_hex),
        updated: None,
    }
}

fn intent(
    name: &str,
    description: Option<&str>,
    group: Option<&str>,
    color: Option<&str>,
) -> UpdateLabelIntent {
    UpdateLabelIntent {
        name: name.to_string(),
        description: description.map(str::to_string),
        group: group.and_then(LabelGroup::from_lenient),
        color: color.and_then(LabelColor::from_hex),
    }
}

fn args(name: &str) -> UpdateLabelArgs {
    UpdateLabelArgs {
        name: name.to_string(),
        description: None,
        group: None,
        color: None,
    }
}

fn opened_state(root: &Path, registry: LabelRegistry) -> AppState {
    let state = AppState::new();
    state
        .set_project_path(Some(root.to_path_buf()))
        .expect("writable");
    state.replace_labels(Some(registry)).expect("writable");
    state
}

// ───────── plan_update_label（純粋ロジック） ─────────

#[test]
fn plan_updates_existing_label_fields() {
    let registry = LabelRegistry {
        labels: vec![
            label("bug", Some("old"), Some("type"), Some("#111111")),
            label("feat", None, None, None),
        ],
    };
    let next = registry
        .plan_update_label(
            intent("bug", Some("new"), Some("kind"), Some("#222222")),
            &fixed_clock(),
        )
        .expect("update ok");

    let bug = next.labels.iter().find(|l| l.name == "bug").unwrap();
    assert_eq!(bug.description.as_deref(), Some("new"));
    assert_eq!(bug.group.as_ref().map(LabelGroup::as_str), Some("kind"));
    assert_eq!(bug.color.as_ref().map(LabelColor::as_str), Some("#222222"));
    // 他ラベルは不変。
    let feat = next.labels.iter().find(|l| l.name == "feat").unwrap();
    assert!(feat.description.is_none());
}

#[test]
fn plan_refreshes_updated_from_clock() {
    let registry = LabelRegistry {
        labels: vec![label("bug", None, None, None)],
    };
    let next = registry
        .plan_update_label(intent("bug", None, None, None), &fixed_clock())
        .expect("update ok");
    assert_eq!(next.labels[0].updated.as_deref(), Some(FIXED_NOW));
}

#[test]
fn plan_clears_optional_when_unset() {
    // PUT セマンティクス: 未指定フィールドは既存値をクリアする。
    let registry = LabelRegistry {
        labels: vec![label("bug", Some("old"), Some("type"), Some("#111111"))],
    };
    let next = registry
        .plan_update_label(intent("bug", None, None, None), &fixed_clock())
        .expect("update ok");
    let bug = &next.labels[0];
    assert!(bug.description.is_none());
    assert!(bug.group.is_none());
    assert!(bug.color.is_none());
}

#[test]
fn plan_rejects_unknown_name() {
    let registry = LabelRegistry {
        labels: vec![label("bug", None, None, None)],
    };
    let err = registry
        .plan_update_label(intent("ghost", None, None, None), &fixed_clock())
        .expect_err("unknown rejected");
    assert!(matches!(err, UpdateLabelPlanError::NotFound { .. }));
}

#[test]
fn plan_rejects_empty_name() {
    let err = LabelRegistry::default()
        .plan_update_label(intent("", None, None, None), &fixed_clock())
        .expect_err("empty rejected");
    assert!(matches!(err, UpdateLabelPlanError::EmptyName));
}

// ───────── update_label_impl（effect 層） ─────────

#[test]
fn impl_updates_and_persists() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![label("bug", Some("old"), None, None)],
        },
    );

    let mut a = args("bug");
    a.description = Some("new".to_string());
    update_label_impl(&state, a, &fixed_clock()).expect("update ok");

    let on_disk = label_registry_store(tmp.path()).load().expect("load");
    assert_eq!(on_disk.labels[0].description.as_deref(), Some("new"));
    assert_eq!(on_disk.labels[0].updated.as_deref(), Some(FIXED_NOW));
    let in_mem = state.labels().expect("labels").expect("some");
    assert_eq!(in_mem.labels[0].description.as_deref(), Some("new"));
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = update_label_impl(&state, args("bug"), &fixed_clock()).expect_err("no project");
    assert!(matches!(err, UpdateLabelError::NoProjectOpen));
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let err: UpdateLabelError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, UpdateLabelError::StateLockPoisoned));
    assert_eq!(err.to_string(), "内部状態のロックが破損しました");
}

#[test]
fn impl_no_commit_on_unknown_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![label("bug", None, None, None)],
        },
    );

    let err = update_label_impl(&state, args("ghost"), &fixed_clock()).expect_err("unknown");
    assert!(matches!(err, UpdateLabelError::Plan(_)));
    // disk へ書き込まれていない。
    assert!(!tmp.path().join(".spec-board").join("labels.yml").exists());
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        UpdateLabelError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

#[test]
fn state_lock_poisoned_display_matches_contract() {
    assert_eq!(
        UpdateLabelError::StateLockPoisoned.to_string(),
        "内部状態のロックが破損しました"
    );
}

// ───────── fixture: identity round-trip (update path) ─────────

#[test]
fn fixture_identity_cases_survive_update_path() {
    use crate::config::label_name_fixture::load_fixture;
    let f = load_fixture();
    for case in &f.identity_cases {
        let mut reg = LabelRegistry::default();
        reg.labels.push(LabelDefinition {
            name: case.name.clone(),
            description: None,
            group: None,
            color: None,
            updated: None,
        });
        let intent = UpdateLabelIntent {
            name: case.name.clone(),
            description: Some("updated desc".to_string()),
            group: None,
            color: None,
        };
        let result = reg.plan_update_label(intent, &fixed_clock());
        assert!(
            result.is_ok(),
            "update should succeed for case '{}': {:?}",
            case.id,
            result.err()
        );
        let updated_reg = result.unwrap();
        let found = updated_reg
            .labels
            .iter()
            .find(|l| l.name == case.name)
            .expect("label should exist after update");
        assert_eq!(
            found.name, case.name,
            "identity must be raw-preserved for case '{}'",
            case.id
        );
        assert_eq!(found.description.as_deref(), Some("updated desc"));
    }
}
