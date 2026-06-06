//! `update_milestone_impl` のテスト（E2E・TempDir）。PUT セマンティクス（未指定クリア・
//! name 維持）と 不在 / 空 name 拒否を検証する。

use std::path::Path;

use tempfile::TempDir;

use super::{update_milestone_impl, UpdateMilestoneArgs, UpdateMilestoneError};
use crate::config::clock::FixedClock;
use crate::config::{
    milestone_registry_store, MilestoneDefinition, MilestoneRegistry, MilestoneRegistryStore,
    MilestoneState, UpdateMilestonePlanError,
};
use crate::state::AppState;

const FIXED_NOW: &str = "2026-06-03T12:00:00Z";

fn fixed_clock() -> FixedClock {
    FixedClock::new(FIXED_NOW)
}

fn args(name: &str) -> UpdateMilestoneArgs {
    UpdateMilestoneArgs {
        name: name.to_string(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
    }
}

fn opened_state(root: &Path, registry: MilestoneRegistry) -> AppState {
    let state = AppState::new();
    state
        .set_project_path(Some(root.to_path_buf()))
        .expect("writable");
    state.replace_milestones(Some(registry)).expect("writable");
    state
}

fn existing_full() -> MilestoneDefinition {
    MilestoneDefinition {
        name: "v0.3".to_string(),
        title: Some("旧タイトル".to_string()),
        description: Some("旧説明".to_string()),
        due: Some("2026-07-31".to_string()),
        order: Some(0),
        state: Some(MilestoneState::Open),
        updated: Some("2026-05-01T00:00:00Z".to_string()),
    }
}

#[test]
fn impl_put_replaces_all_fields_and_keeps_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![existing_full()],
        },
    );

    let mut a = args("v0.3");
    a.title = Some("新タイトル".to_string());
    a.due = Some("2026-08-31".to_string());
    a.order = Some(2);
    a.state = Some("closed".to_string());
    update_milestone_impl(&state, a, &fixed_clock()).expect("update ok");

    let on_disk = milestone_registry_store(tmp.path()).load().expect("load");
    let m = &on_disk.milestones[0];
    assert_eq!(m.name, "v0.3", "name は維持");
    assert_eq!(m.title.as_deref(), Some("新タイトル"));
    assert_eq!(m.due.as_deref(), Some("2026-08-31"));
    assert_eq!(m.order, Some(2));
    assert_eq!(m.state, Some(MilestoneState::Closed));
    assert_eq!(m.updated.as_deref(), Some(FIXED_NOW));
}

#[test]
fn impl_put_clears_unspecified_optionals() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![existing_full()],
        },
    );

    // すべて未指定で送る（name のみ）→ optional は全クリア（PUT）。
    update_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect("update ok");

    let on_disk = milestone_registry_store(tmp.path()).load().expect("load");
    let m = &on_disk.milestones[0];
    assert!(m.title.is_none());
    assert!(m.description.is_none());
    assert!(m.due.is_none());
    assert!(m.order.is_none());
    assert!(m.state.is_none());
}

#[test]
fn impl_returns_not_found_for_unknown_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![existing_full()],
        },
    );

    let err = update_milestone_impl(&state, args("v9.9"), &fixed_clock()).expect_err("not found");
    assert!(matches!(
        err,
        UpdateMilestoneError::Plan(UpdateMilestonePlanError::NotFound { .. })
    ));
}

#[test]
fn impl_returns_empty_name_error() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), MilestoneRegistry::default());

    let err = update_milestone_impl(&state, args(""), &fixed_clock()).expect_err("empty name");
    assert!(matches!(
        err,
        UpdateMilestoneError::Plan(UpdateMilestonePlanError::EmptyName)
    ));
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = update_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect_err("no project");
    assert!(matches!(err, UpdateMilestoneError::NoProjectOpen));
}
