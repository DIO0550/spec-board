//! マイルストーン書き込み系 race 回避 API のユニットテスト。
//!
//! `snapshot_milestone_write` / `snapshot_milestone_delete` /
//! `replace_milestones_if_project_matches` の取得・整合 snapshot・check-and-set
//! （一致 commit / 不一致 no-op）・poison 伝播を検証する。

use super::{AppState, AppStateError};

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use crate::config::{MilestoneDefinition, MilestoneRegistry};
use crate::task::task_index::Task;

fn sample_milestones() -> MilestoneRegistry {
    MilestoneRegistry {
        milestones: vec![MilestoneDefinition {
            name: "v0.3".to_string(),
            title: None,
            description: None,
            due: None,
            order: None,
            state: None,
            updated: None,
        }],
    }
}

fn sample_task(id: &str) -> Task {
    Task {
        id: id.into(),
        file_path: id.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
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

fn poison_milestones(state: Arc<AppState>) {
    let handle = thread::spawn(move || {
        let _guard = state.milestones.lock().expect("lockable before panic");
        panic!("poison milestones");
    });
    let _ = handle.join();
}

fn poison_tasks_cache(state: Arc<AppState>) {
    let handle = thread::spawn(move || {
        let _guard = state.tasks_cache.lock().expect("lockable before panic");
        panic!("poison tasks_cache");
    });
    let _ = handle.join();
}

#[test]
fn snapshot_milestone_write_returns_project_and_milestones() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");
    state
        .replace_milestones(Some(sample_milestones()))
        .expect("writable");

    let ctx = state.snapshot_milestone_write().expect("snapshot");
    assert_eq!(ctx.project_root, Some(path));
    assert_eq!(ctx.milestones, Some(sample_milestones()));
}

#[test]
fn snapshot_milestone_write_returns_none_when_unopened() {
    let state = AppState::new();
    let ctx = state.snapshot_milestone_write().expect("snapshot");
    assert_eq!(ctx.project_root, None);
    assert_eq!(ctx.milestones, None);
}

#[test]
fn snapshot_milestone_delete_returns_context_with_tasks() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");
    state
        .replace_milestones(Some(sample_milestones()))
        .expect("writable");
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b.md"));
    state.replace_tasks_cache(cache).expect("writable");

    let ctx = state.snapshot_milestone_delete().expect("snapshot");
    assert_eq!(ctx.project_root, Some(path));
    assert_eq!(ctx.milestones, Some(sample_milestones()));
    assert_eq!(ctx.tasks.len(), 2);
}

#[test]
fn replace_milestones_if_project_matches_commits_on_match() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");

    let committed = state
        .replace_milestones_if_project_matches(&path, sample_milestones())
        .expect("writable");
    assert!(committed);
    assert_eq!(
        state.milestones().expect("milestones"),
        Some(sample_milestones())
    );
}

#[test]
fn replace_milestones_if_project_matches_noop_on_mismatch() {
    let state = AppState::new();
    state
        .set_project_path(Some(PathBuf::from("/tmp/project-a")))
        .expect("writable");
    state
        .replace_milestones(Some(MilestoneRegistry::default()))
        .expect("writable");

    let committed = state
        .replace_milestones_if_project_matches(
            &PathBuf::from("/tmp/project-b"),
            sample_milestones(),
        )
        .expect("writable");
    assert!(!committed);
    // snapshot 時と project が変わっているため milestones は元のまま（no-op）。
    assert_eq!(
        state.milestones().expect("milestones"),
        Some(MilestoneRegistry::default())
    );
}

#[test]
fn snapshot_milestone_write_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_milestones(Arc::clone(&state));

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .snapshot_milestone_write()
            .expect_err("poisoned snapshot"),
    );
}

#[test]
fn snapshot_milestone_delete_reports_poison_on_tasks_cache() {
    let state = Arc::new(AppState::new());
    poison_tasks_cache(Arc::clone(&state));

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .snapshot_milestone_delete()
            .expect_err("poisoned snapshot"),
    );
}
