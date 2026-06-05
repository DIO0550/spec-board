//! `get_milestones_impl` のテスト。一覧 + usageCounts / 未割当・未定義値 /
//! プロジェクト未オープン / lock 破損（From 変換）を検証する。

use std::path::{Path, PathBuf};

use super::{get_milestones_impl, GetMilestonesError, GetMilestonesPayload};
use crate::config::{MilestoneDefinition, MilestoneRegistry};
use crate::state::{AppState, AppStateError};
use crate::task::task_index::Task;

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

fn task_with_milestone(id: &str, milestone: Option<&str>) -> Task {
    Task {
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: milestone.map(str::to_owned),
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

fn opened_state(root: &Path, registry: MilestoneRegistry, tasks: Vec<Task>) -> AppState {
    let state = AppState::new();
    state
        .set_project_path(Some(root.to_path_buf()))
        .expect("writable");
    state.replace_milestones(Some(registry)).expect("writable");
    let cache = tasks
        .into_iter()
        .enumerate()
        .map(|(i, t)| (PathBuf::from(format!("{i}.md")), t))
        .collect();
    state.replace_tasks_cache(cache).expect("writable");
    state
}

#[test]
fn returns_list_and_usage_counts() {
    let state = opened_state(
        Path::new("/tmp/p"),
        MilestoneRegistry {
            milestones: vec![definition("v0.3"), definition("v0.4")],
        },
        vec![
            task_with_milestone("a", Some("v0.3")),
            task_with_milestone("b", Some("v0.3")),
        ],
    );

    let payload = get_milestones_impl(&state).expect("get ok");
    let names: Vec<&str> = payload.milestones.iter().map(|m| m.name.as_str()).collect();
    assert_eq!(names, vec!["v0.3", "v0.4"]);
    assert_eq!(payload.usage_counts.get("v0.3"), Some(&2));
}

#[test]
fn unassigned_and_undefined_values() {
    let state = opened_state(
        Path::new("/tmp/p"),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
        vec![
            task_with_milestone("a", None),
            task_with_milestone("b", Some("undefined-ms")),
        ],
    );

    let payload = get_milestones_impl(&state).expect("get ok");
    // 未割当は usageCounts に出ない。マスタ未定義値は出現名で計上される。
    assert_eq!(payload.usage_counts.get("undefined-ms"), Some(&1));
    assert!(!payload.usage_counts.contains_key("v0.3"));
}

#[test]
fn returns_no_project_open() {
    let state = AppState::new();
    let err = get_milestones_impl(&state).expect_err("no project");
    assert!(matches!(err, GetMilestonesError::NoProjectOpen));
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let err: GetMilestonesError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, GetMilestonesError::StateLockPoisoned));
    assert_eq!(err.to_string(), "内部状態のロックが破損しました");
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        GetMilestonesError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

#[test]
fn payload_serializes_camel_case() {
    let payload = GetMilestonesPayload {
        milestones: vec![definition("v0.3")],
        usage_counts: std::collections::HashMap::new(),
    };
    let json = serde_json::to_value(&payload).expect("serialize");
    assert!(json.get("usageCounts").is_some());
    assert!(json.get("milestones").is_some());
}
