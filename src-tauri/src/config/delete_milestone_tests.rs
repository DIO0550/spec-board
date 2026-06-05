//! `delete_milestone_impl` のテスト（E2E・TempDir）。削除 + usageCount 返却 +
//! frontmatter 不変（非破壊）+ 不在拒否を検証する。

use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::{
    delete_milestone_impl, DeleteMilestoneArgs, DeleteMilestoneError, DeleteMilestonePayload,
};
use crate::config::{
    milestone_registry_store, DeleteMilestonePlanError, MilestoneDefinition, MilestoneRegistry,
    MilestoneRegistryStore,
};
use crate::state::AppState;
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

fn args(name: &str) -> DeleteMilestoneArgs {
    DeleteMilestoneArgs {
        name: name.to_string(),
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
fn impl_deletes_and_returns_usage_count() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
        vec![
            task_with_milestone("a", Some("v0.3")),
            task_with_milestone("b", Some("v0.3")),
            task_with_milestone("c", Some("v0.3")),
        ],
    );

    let payload = delete_milestone_impl(&state, args("v0.3")).expect("delete ok");
    assert_eq!(payload, DeleteMilestonePayload { usage_count: 3 });

    let on_disk = milestone_registry_store(tmp.path()).load().expect("load");
    assert!(on_disk.milestones.iter().all(|m| m.name != "v0.3"));
    let in_mem = state.milestones().expect("milestones").expect("some");
    assert!(in_mem.milestones.iter().all(|m| m.name != "v0.3"));
}

#[test]
fn impl_zero_usage_for_unused_milestone() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
        Vec::new(),
    );

    let payload = delete_milestone_impl(&state, args("v0.3")).expect("delete ok");
    assert_eq!(payload.usage_count, 0);
}

#[test]
fn impl_does_not_touch_task_frontmatter() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
        vec![task_with_milestone("a", Some("v0.3"))],
    );

    delete_milestone_impl(&state, args("v0.3")).expect("delete ok");

    // tasks_cache の milestone 値は変化しない（非破壊）。
    let tasks = state.tasks_snapshot().expect("tasks");
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].milestone.as_deref(), Some("v0.3"));
}

#[test]
fn impl_no_commit_on_unknown_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        MilestoneRegistry {
            milestones: vec![definition("v0.3")],
        },
        Vec::new(),
    );

    let err = delete_milestone_impl(&state, args("ghost")).expect_err("unknown");
    assert!(matches!(
        err,
        DeleteMilestoneError::Plan(DeleteMilestonePlanError::NotFound { .. })
    ));
    let in_mem = state.milestones().expect("milestones").expect("some");
    assert!(in_mem.milestones.iter().any(|m| m.name == "v0.3"));
    assert!(!tmp
        .path()
        .join(".spec-board")
        .join("milestones.yml")
        .exists());
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = delete_milestone_impl(&state, args("v0.3")).expect_err("no project");
    assert!(matches!(err, DeleteMilestoneError::NoProjectOpen));
}

#[test]
fn payload_serializes_usage_count_as_camel_case() {
    let json = serde_json::to_value(DeleteMilestonePayload { usage_count: 3 }).expect("serialize");
    assert_eq!(json, serde_json::json!({ "usageCount": 3 }));
}
