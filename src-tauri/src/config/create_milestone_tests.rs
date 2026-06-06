//! `create_milestone_impl` / `From<CreateMilestoneArgs>` のテスト（E2E・TempDir）。

use std::path::Path;

use tempfile::TempDir;

use super::{create_milestone_impl, CreateMilestoneArgs, CreateMilestoneError};
use crate::config::clock::FixedClock;
use crate::config::{
    milestone_registry_store, MilestoneDefinition, MilestoneRegistry, MilestoneRegistryStore,
    MilestoneState,
};
use crate::state::{AppState, AppStateError};

const FIXED_NOW: &str = "2026-06-03T12:00:00Z";

fn fixed_clock() -> FixedClock {
    FixedClock::new(FIXED_NOW)
}

fn args(name: &str) -> CreateMilestoneArgs {
    CreateMilestoneArgs {
        name: name.to_string(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
    }
}

fn definition(name: &str) -> MilestoneDefinition {
    MilestoneDefinition {
        name: name.to_string(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
        updated: None,
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

// ───────── From<CreateMilestoneArgs>（lenient 変換） ─────────

#[test]
fn from_args_empty_strings_become_none() {
    let mut a = args("v0.3");
    a.title = Some(String::new());
    a.due = Some(String::new());
    a.state = Some(String::new());
    let def = MilestoneDefinition::from(a);
    assert!(def.title.is_none());
    assert!(def.due.is_none());
    assert!(
        def.state.is_none(),
        "空文字 state は Other(\"\") にせず None"
    );
}

#[test]
fn from_args_unknown_state_is_other() {
    let mut a = args("v0.3");
    a.state = Some("frozen".to_string());
    let def = MilestoneDefinition::from(a);
    assert_eq!(def.state, Some(MilestoneState::Other("frozen".to_string())));
}

#[test]
fn from_args_known_state_is_normalized() {
    let mut a = args("v0.3");
    a.state = Some("closed".to_string());
    let def = MilestoneDefinition::from(a);
    assert_eq!(def.state, Some(MilestoneState::Closed));
}

// ───────── create_milestone_impl（effect 層） ─────────

#[test]
fn impl_creates_and_persists_with_updated() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), MilestoneRegistry::default());

    create_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect("create ok");

    let on_disk = milestone_registry_store(tmp.path()).load().expect("load");
    assert_eq!(on_disk.milestones.len(), 1);
    assert_eq!(on_disk.milestones[0].name, "v0.3");
    assert_eq!(on_disk.milestones[0].updated.as_deref(), Some(FIXED_NOW));
    let in_mem = state.milestones().expect("milestones").expect("some");
    assert_eq!(in_mem.milestones.len(), 1);
}

#[test]
fn impl_creates_file_when_absent() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), MilestoneRegistry::default());

    create_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect("create ok");

    assert!(tmp
        .path()
        .join(".spec-board")
        .join("milestones.yml")
        .exists());
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = create_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect_err("no project");
    assert!(matches!(err, CreateMilestoneError::NoProjectOpen));
}

#[test]
fn impl_no_commit_on_duplicate_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
    );

    let err = create_milestone_impl(&state, args("v0.3"), &fixed_clock()).expect_err("duplicate");
    assert!(matches!(err, CreateMilestoneError::Validation(_)));
    // in-memory は 1 件のまま・disk write されない。
    let in_mem = state.milestones().expect("milestones").expect("some");
    assert_eq!(in_mem.milestones.len(), 1);
    assert!(!tmp
        .path()
        .join(".spec-board")
        .join("milestones.yml")
        .exists());
}

#[test]
fn impl_no_commit_on_empty_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), MilestoneRegistry::default());

    let err = create_milestone_impl(&state, args(""), &fixed_clock()).expect_err("empty name");
    assert!(matches!(err, CreateMilestoneError::Validation(_)));
    let in_mem = state.milestones().expect("milestones").expect("some");
    assert!(in_mem.milestones.is_empty());
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let err: CreateMilestoneError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, CreateMilestoneError::StateLockPoisoned));
    assert_eq!(err.to_string(), "内部状態のロックが破損しました");
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        CreateMilestoneError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}
