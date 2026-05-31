//! ラベル書き込み系 race 回避 API のユニットテスト。
//!
//! `snapshot_label_write` / `snapshot_label_delete` / `replace_labels_if_project_matches`
//! の取得・整合 snapshot・check-and-set（一致 commit / 不一致 no-op）・poison 伝播を検証する。

use super::{AppState, AppStateError};

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use crate::config::{LabelDefinition, LabelRegistry};
use crate::task::task_index::Task;

fn sample_labels() -> LabelRegistry {
    LabelRegistry {
        labels: vec![LabelDefinition {
            name: "bug".to_string(),
            description: None,
            group: None,
            color: None,
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

/// 指定フィールドの lock を保持したまま別スレッドで panic させ、その `Mutex` を poison する。
fn poison_labels(state: Arc<AppState>) {
    let handle = thread::spawn(move || {
        let _guard = state.labels.lock().expect("lockable before panic");
        panic!("poison labels");
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
fn snapshot_label_write_returns_project_and_labels() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");
    state
        .replace_labels(Some(sample_labels()))
        .expect("writable");

    let ctx = state.snapshot_label_write().expect("snapshot");
    assert_eq!(ctx.project_root, Some(path));
    assert_eq!(ctx.labels, Some(sample_labels()));
}

#[test]
fn snapshot_label_write_returns_none_when_unopened() {
    let state = AppState::new();
    let ctx = state.snapshot_label_write().expect("snapshot");
    assert_eq!(ctx.project_root, None);
    assert_eq!(ctx.labels, None);
}

#[test]
fn snapshot_label_delete_returns_context_with_tasks() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");
    state
        .replace_labels(Some(sample_labels()))
        .expect("writable");
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b.md"));
    state.replace_tasks_cache(cache).expect("writable");

    let ctx = state.snapshot_label_delete().expect("snapshot");
    assert_eq!(ctx.project_root, Some(path));
    assert_eq!(ctx.labels, Some(sample_labels()));
    assert_eq!(ctx.tasks.len(), 2);
}

#[test]
fn replace_labels_if_project_matches_commits_on_match() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(path.clone()))
        .expect("writable");

    let committed = state
        .replace_labels_if_project_matches(&path, sample_labels())
        .expect("writable");
    assert!(committed);
    assert_eq!(state.labels().expect("labels"), Some(sample_labels()));
}

#[test]
fn replace_labels_if_project_matches_noop_on_mismatch() {
    let state = AppState::new();
    state
        .set_project_path(Some(PathBuf::from("/tmp/project-a")))
        .expect("writable");
    state
        .replace_labels(Some(LabelRegistry::default()))
        .expect("writable");

    let committed = state
        .replace_labels_if_project_matches(&PathBuf::from("/tmp/project-b"), sample_labels())
        .expect("writable");
    assert!(!committed);
    // snapshot 時と project が変わっているため labels は元のまま（no-op）。
    assert_eq!(
        state.labels().expect("labels"),
        Some(LabelRegistry::default())
    );
}

#[test]
fn snapshot_label_write_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_labels(Arc::clone(&state));

    assert_eq!(
        AppStateError::LockPoisoned,
        state.snapshot_label_write().expect_err("poisoned snapshot"),
    );
}

#[test]
fn snapshot_label_delete_reports_poison_on_tasks_cache() {
    let state = Arc::new(AppState::new());
    poison_tasks_cache(Arc::clone(&state));

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .snapshot_label_delete()
            .expect_err("poisoned snapshot"),
    );
}
