//! `delete_label_impl` / `LabelRegistry::plan_delete_label` のテスト。

use std::path::{Path, PathBuf};

use tempfile::TempDir;

use super::{delete_label_impl, DeleteLabelArgs, DeleteLabelError, DeleteLabelPayload};
use crate::config::{
    label_registry_store, DeleteLabelPlanError, LabelDefinition, LabelRegistry, LabelRegistryStore,
};
use crate::state::{AppState, AppStateError};
use crate::task::label::Label;
use crate::task::task_index::Task;

fn definition(name: &str) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: None,
        group: None,
        color: None,
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

fn args(name: &str) -> DeleteLabelArgs {
    DeleteLabelArgs {
        name: name.to_string(),
    }
}

fn opened_state(root: &Path, registry: LabelRegistry, tasks: Vec<Task>) -> AppState {
    let state = AppState::new();
    state
        .set_project_path(Some(root.to_path_buf()))
        .expect("writable");
    state.replace_labels(Some(registry)).expect("writable");
    let cache = tasks
        .into_iter()
        .enumerate()
        .map(|(i, t)| (PathBuf::from(format!("{i}.md")), t))
        .collect();
    state.replace_tasks_cache(cache).expect("writable");
    state
}

// ───────── plan_delete_label（純粋ロジック） ─────────

#[test]
fn plan_removes_label() {
    let registry = LabelRegistry {
        labels: vec![definition("bug"), definition("feat")],
    };
    let next = registry.plan_delete_label("bug").expect("delete ok");
    let names: Vec<&str> = next.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["feat"]);
}

#[test]
fn plan_rejects_unknown_name() {
    let registry = LabelRegistry {
        labels: vec![definition("bug")],
    };
    let err = registry
        .plan_delete_label("ghost")
        .expect_err("unknown rejected");
    assert!(matches!(err, DeleteLabelPlanError::NotFound { .. }));
}

// ───────── delete_label_impl（effect 層） ─────────

#[test]
fn impl_deletes_and_persists_with_zero_usage() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
        Vec::new(),
    );

    let payload = delete_label_impl(&state, args("bug")).expect("delete ok");
    assert_eq!(payload, DeleteLabelPayload { usage_count: 0 });

    let on_disk = label_registry_store(tmp.path()).load().expect("load");
    assert!(on_disk.labels.iter().all(|l| l.name != "bug"));
    let in_mem = state.labels().expect("labels").expect("some");
    assert!(in_mem.labels.iter().all(|l| l.name != "bug"));
}

#[test]
fn impl_returns_pre_delete_usage_count() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
        vec![
            task_with_labels("a", &["bug"]),
            task_with_labels("b", &["bug"]),
        ],
    );

    let payload = delete_label_impl(&state, args("bug")).expect("delete ok");
    // 2 タスクで使用中でも削除は実行され、削除前の件数を返す。
    assert_eq!(payload.usage_count, 2);
    let on_disk = label_registry_store(tmp.path()).load().expect("load");
    assert!(on_disk.labels.iter().all(|l| l.name != "bug"));
}

#[test]
fn impl_usage_count_counts_task_not_occurrences() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
        vec![
            task_with_labels("a", &["bug", "bug"]),
            task_with_labels("b", &["bug"]),
        ],
    );

    let payload = delete_label_impl(&state, args("bug")).expect("delete ok");
    // 1 タスク内重複は 1 件。タスク件数で数える。
    assert_eq!(payload.usage_count, 2);
}

#[test]
fn impl_does_not_touch_task_frontmatter() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
        vec![task_with_labels("a", &["bug"])],
    );

    delete_label_impl(&state, args("bug")).expect("delete ok");

    // tasks_cache のラベルは変化しない。
    let tasks = state.tasks_snapshot().expect("tasks");
    assert_eq!(tasks.len(), 1);
    assert!(tasks[0].labels.iter().any(|l| l.as_str() == "bug"));
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = delete_label_impl(&state, args("bug")).expect_err("no project");
    assert!(matches!(err, DeleteLabelError::NoProjectOpen));
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    // labels / tasks_cache いずれの lock poison も state 層で `AppStateError::LockPoisoned`
    // となり、command 層は `From` で `StateLockPoisoned`（文字列契約一致）に変換する。
    // 個別フィールドの poison 検出は state 層テスト（snapshot_label_delete_reports_poison_*）が担う。
    let err: DeleteLabelError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, DeleteLabelError::StateLockPoisoned));
    assert_eq!(err.to_string(), "内部状態のロックが破損しました");
}

#[test]
fn impl_no_commit_on_unknown_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
        Vec::new(),
    );

    let err = delete_label_impl(&state, args("ghost")).expect_err("unknown");
    assert!(matches!(err, DeleteLabelError::Plan(_)));
    // in-memory は bug を保持。
    let in_mem = state.labels().expect("labels").expect("some");
    assert!(in_mem.labels.iter().any(|l| l.name == "bug"));
    // disk は書き換わっていない。
    assert!(!tmp.path().join(".spec-board").join("labels.yml").exists());
}

#[test]
fn payload_serializes_usage_count_as_camel_case() {
    let json = serde_json::to_value(DeleteLabelPayload { usage_count: 3 }).expect("serialize");
    assert_eq!(json, serde_json::json!({ "usageCount": 3 }));
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        DeleteLabelError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}
