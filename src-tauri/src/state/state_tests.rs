use super::{AppState, AppStateError, BoxedWatcherHandle};

use std::collections::HashMap;
use std::panic::{self, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

use spec_board_fs::watcher::handle::WatcherHandle;

use crate::config::column_name::ColumnName;
use crate::config::{
    CardOrder, Column, Config, LabelDefinition, LabelRegistry, MilestoneDefinition,
    MilestoneRegistry,
};
use crate::task::task_index::Task;

fn sample_task(id: &str, file_path: &str) -> Task {
    Task {
        draft: false,
        id: id.into(),
        file_path: file_path.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
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

fn sample_config() -> Config {
    Config {
        version: 1,
        columns: vec![Column {
            name: "Todo".into(),
            order: 0,
            color: None,
        }],
        card_order: CardOrder::default(),
        done_column: None,
    }
}

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

struct CountingHandle {
    stop_calls: Arc<AtomicUsize>,
}

impl WatcherHandle for CountingHandle {
    fn stop(&mut self) {
        self.stop_calls.fetch_add(1, Ordering::SeqCst);
    }
}

struct PanickingHandle;

impl WatcherHandle for PanickingHandle {
    fn stop(&mut self) {
        panic!("watcher stop panic for test");
    }
}

fn boxed_counter(counter: &Arc<AtomicUsize>) -> BoxedWatcherHandle {
    Box::new(CountingHandle {
        stop_calls: Arc::clone(counter),
    })
}

#[test]
fn new_initializes_all_fields_to_empty() {
    let state = AppState::new();

    assert_eq!(None, state.project_path().expect("readable"));
    assert_eq!(None, state.config().expect("readable"));
    assert_eq!(None, state.labels().expect("readable"));
    assert!(state.tasks_snapshot().expect("readable").is_empty());
    assert!(state.take_watcher_handle().expect("readable").is_none());
    assert!(state.write_ignore().is_empty().expect("readable"));
}

#[test]
fn set_project_path_round_trip() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/spec-board");

    state
        .set_project_path(Some(path.clone()))
        .expect("writable");

    assert_eq!(Some(path), state.project_path().expect("readable"));
}

#[test]
fn set_project_path_overwrites_previous_value() {
    let state = AppState::new();
    let first = PathBuf::from("/tmp/first");
    let second = PathBuf::from("/tmp/second");

    state.set_project_path(Some(first)).expect("writable");
    state
        .set_project_path(Some(second.clone()))
        .expect("writable");

    assert_eq!(Some(second), state.project_path().expect("readable"));
}

#[test]
fn set_project_path_can_clear_to_none() {
    let state = AppState::new();
    state
        .set_project_path(Some(PathBuf::from("/tmp/x")))
        .expect("writable");

    state.set_project_path(None).expect("writable");

    assert_eq!(None, state.project_path().expect("readable"));
}

#[test]
fn replace_config_round_trip_and_overwrite() {
    let state = AppState::new();
    let cfg = sample_config();

    state.replace_config(Some(cfg.clone())).expect("writable");
    assert_eq!(Some(cfg), state.config().expect("readable"));

    let mut other = sample_config();
    other.version = 2;
    state.replace_config(Some(other.clone())).expect("writable");
    assert_eq!(Some(other), state.config().expect("readable"));

    state.replace_config(None).expect("writable");
    assert_eq!(None, state.config().expect("readable"));
}

#[test]
fn replace_tasks_cache_returns_values_via_snapshot() {
    let state = AppState::new();
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b", "b.md"));

    state.replace_tasks_cache(cache.clone()).expect("writable");

    let mut snapshot = state.tasks_snapshot().expect("readable");
    snapshot.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    let mut expected: Vec<Task> = cache.into_values().collect();
    expected.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    assert_eq!(expected, snapshot);
}

#[test]
fn tasks_snapshot_is_empty_for_fresh_state() {
    let state = AppState::new();

    assert!(state.tasks_snapshot().expect("readable").is_empty());
}

#[test]
fn replace_tasks_cache_drops_previous_entries() {
    let state = AppState::new();
    let mut first = HashMap::new();
    first.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
    state.replace_tasks_cache(first).expect("writable");

    let mut second = HashMap::new();
    second.insert(PathBuf::from("b.md"), sample_task("b", "b.md"));
    state.replace_tasks_cache(second).expect("writable");

    let mut snapshot = state.tasks_snapshot().expect("readable");
    snapshot.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    assert_eq!(1, snapshot.len());
    assert_eq!("b.md", snapshot[0].file_path);
}

#[test]
fn install_watcher_handle_transitions_none_to_some() {
    let state = AppState::new();
    let counter = Arc::new(AtomicUsize::new(0));

    state
        .install_watcher_handle(boxed_counter(&counter))
        .expect("writable");

    assert!(state.take_watcher_handle().expect("readable").is_some());
    assert_eq!(0, counter.load(Ordering::SeqCst));
}

#[test]
fn install_watcher_handle_stops_previous_handle_once() {
    let state = AppState::new();
    let first_counter = Arc::new(AtomicUsize::new(0));
    let second_counter = Arc::new(AtomicUsize::new(0));

    state
        .install_watcher_handle(boxed_counter(&first_counter))
        .expect("writable");
    state
        .install_watcher_handle(boxed_counter(&second_counter))
        .expect("writable");

    assert_eq!(1, first_counter.load(Ordering::SeqCst));
    assert_eq!(0, second_counter.load(Ordering::SeqCst));
}

#[test]
fn take_watcher_handle_returns_previous_handle_and_clears_state() {
    let state = AppState::new();
    let counter = Arc::new(AtomicUsize::new(0));
    state
        .install_watcher_handle(boxed_counter(&counter))
        .expect("writable");

    let taken = state.take_watcher_handle().expect("readable");
    assert!(taken.is_some());

    let next = state.take_watcher_handle().expect("readable");
    assert!(next.is_none());
}

#[test]
fn watcher_handle_stop_panic_propagates_and_poisons_mutex() {
    let state = Arc::new(AppState::new());
    state
        .install_watcher_handle(Box::new(PanickingHandle))
        .expect("writable");

    let panicking_state = Arc::clone(&state);
    let result = panic::catch_unwind(AssertUnwindSafe(move || {
        let _ = panicking_state.install_watcher_handle(Box::new(PanickingHandle));
    }));

    assert!(result.is_err(), "stop panic should propagate");

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .install_watcher_handle(Box::new(PanickingHandle))
            .expect_err("poisoned lock should surface")
    );
    match state.take_watcher_handle() {
        Err(AppStateError::LockPoisoned) => {}
        Ok(_) => panic!("poisoned lock should surface"),
    }
}

fn poison_mutex<F>(state: Arc<AppState>, panic_in_lock: F)
where
    F: FnOnce(&AppState) + Send + 'static,
{
    let join = thread::spawn(move || {
        panic_in_lock(state.as_ref());
    });
    assert!(join.join().is_err());
}

#[test]
fn project_path_lock_poison_is_reported() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.project_path.lock().expect("lockable before panic");
        panic!("poison project_path");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.project_path().expect_err("poisoned read")
    );
    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .set_project_path(Some(PathBuf::from("/tmp/x")))
            .expect_err("poisoned write")
    );
}

#[test]
fn config_lock_poison_is_reported() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.config.lock().expect("lockable before panic");
        panic!("poison config");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.config().expect_err("poisoned read")
    );
    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .replace_config(Some(sample_config()))
            .expect_err("poisoned write")
    );
}

#[test]
fn tasks_cache_lock_poison_is_reported() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.tasks_cache.lock().expect("lockable before panic");
        panic!("poison tasks_cache");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.tasks_snapshot().expect_err("poisoned read")
    );
    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .replace_tasks_cache(HashMap::new())
            .expect_err("poisoned write")
    );
}

#[test]
fn check_project_path_lock_returns_ok_for_healthy_state() {
    let state = AppState::new();

    state.check_project_path_lock().expect("healthy lock");
}

#[test]
fn check_project_path_lock_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.project_path.lock().expect("lockable before panic");
        panic!("poison project_path");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_project_path_lock().expect_err("poisoned probe"),
    );
}

#[test]
fn check_config_lock_returns_ok_for_healthy_state() {
    let state = AppState::new();

    state.check_config_lock().expect("healthy lock");
}

#[test]
fn check_config_lock_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.config.lock().expect("lockable before panic");
        panic!("poison config");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_config_lock().expect_err("poisoned probe"),
    );
}

#[test]
fn check_tasks_cache_lock_returns_ok_for_healthy_state() {
    let state = AppState::new();

    state.check_tasks_cache_lock().expect("healthy lock");
}

#[test]
fn check_tasks_cache_lock_does_not_clone_entries() {
    // 仕様上 probe は副作用なし & タスクの clone を行わない契約。entry
    // をいくつ詰めても probe 自体は O(1) で同じ呼び出しが完了することを担保する。
    let state = AppState::new();
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b", "b.md"));
    state.replace_tasks_cache(cache).expect("writable");

    // clone を行わないことの直接観測は難しいため、複数回呼んでも Ok かつ
    // tasks_snapshot で内容が保持されたままであることを確認する。
    for _ in 0..5 {
        state.check_tasks_cache_lock().expect("healthy lock");
    }
    assert_eq!(2, state.tasks_snapshot().expect("readable").len());
}

#[test]
fn check_tasks_cache_lock_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.tasks_cache.lock().expect("lockable before panic");
        panic!("poison tasks_cache");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_tasks_cache_lock().expect_err("poisoned probe"),
    );
}

#[test]
fn check_all_locks_returns_ok_for_healthy_state() {
    let state = AppState::new();

    state.check_all_locks().expect("all healthy");
}

#[test]
fn check_all_locks_reports_poison_when_any_field_is_poisoned() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.watcher_handle.lock().expect("lockable before panic");
        panic!("poison watcher_handle");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_all_locks().expect_err("poisoned"),
    );
}

#[test]
fn check_watcher_handle_lock_returns_ok_for_healthy_state() {
    let state = AppState::new();

    state.check_watcher_handle_lock().expect("healthy lock");
}

#[test]
fn check_watcher_handle_lock_does_not_modify_state() {
    let state = AppState::new();
    let counter = Arc::new(AtomicUsize::new(0));
    state
        .install_watcher_handle(boxed_counter(&counter))
        .expect("writable");

    state.check_watcher_handle_lock().expect("healthy lock");
    state.check_watcher_handle_lock().expect("healthy lock");

    // 探査後も install されたハンドルは消えていない。
    assert!(state.take_watcher_handle().expect("readable").is_some());
    // probe では stop() を呼ばないため counter は 0 のまま。
    assert_eq!(0, counter.load(Ordering::SeqCst));
}

#[test]
fn check_watcher_handle_lock_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.watcher_handle.lock().expect("lockable before panic");
        panic!("poison watcher_handle");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .check_watcher_handle_lock()
            .expect_err("poisoned probe"),
    );
}

#[test]
fn watcher_handle_lock_poison_is_reported() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.watcher_handle.lock().expect("lockable before panic");
        panic!("poison watcher_handle");
    });

    match state.take_watcher_handle() {
        Err(AppStateError::LockPoisoned) => {}
        Ok(_) => panic!("poisoned read should surface"),
    }
    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .install_watcher_handle(Box::new(CountingHandle {
                stop_calls: Arc::new(AtomicUsize::new(0))
            }))
            .expect_err("poisoned write")
    );
}

#[test]
fn lock_poisoned_error_supports_equality() {
    assert_eq!(AppStateError::LockPoisoned, AppStateError::LockPoisoned);
}

#[test]
fn write_ignore_forwarder_routes_to_inner_registry() {
    let state = AppState::new();
    let path = PathBuf::from("tasks/example.md");

    assert!(state
        .write_ignore()
        .register(&path)
        .expect("registry writable"));
    assert!(state
        .write_ignore()
        .should_ignore(&path)
        .expect("registry readable"));
    assert_eq!(1, state.write_ignore().len().expect("registry readable"));
    assert!(state
        .write_ignore()
        .unregister(&path)
        .expect("registry writable"));
    assert!(state.write_ignore().is_empty().expect("registry readable"));
}

#[test]
fn app_state_is_send_sync_static() {
    fn assert_send_sync_static<T: Send + Sync + 'static>() {}
    assert_send_sync_static::<AppState>();
}

// ───────── labels（6 番目フィールド） ─────────

#[test]
fn replace_labels_round_trip_and_overwrite() {
    let state = AppState::new();
    state
        .replace_labels(Some(sample_labels()))
        .expect("writable");
    assert_eq!(Some(sample_labels()), state.labels().expect("readable"));

    state.replace_labels(None).expect("writable");
    assert_eq!(None, state.labels().expect("readable"));
}

#[test]
fn labels_lock_poison_is_reported() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.labels.lock().expect("lockable before panic");
        panic!("poison labels");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.labels().expect_err("poisoned read")
    );
    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .replace_labels(Some(sample_labels()))
            .expect_err("poisoned write")
    );
}

#[test]
fn check_labels_lock_returns_ok_for_healthy_state() {
    let state = AppState::new();
    state.check_labels_lock().expect("healthy lock");
}

#[test]
fn check_labels_lock_reports_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.labels.lock().expect("lockable before panic");
        panic!("poison labels");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_labels_lock().expect_err("poisoned probe"),
    );
}

#[test]
fn check_all_locks_reports_poison_when_labels_is_poisoned() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.labels.lock().expect("lockable before panic");
        panic!("poison labels");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state.check_all_locks().expect_err("poisoned"),
    );
}

#[test]
fn replace_project_config_labels_and_milestones_swaps_four_fields() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .replace_project_config_labels_and_milestones(
            Some(path.clone()),
            Some(sample_config()),
            Some(sample_labels()),
            Some(sample_milestones()),
        )
        .expect("writable");

    assert_eq!(Some(path), state.project_path().expect("readable"));
    assert_eq!(Some(sample_config()), state.config().expect("readable"));
    assert_eq!(Some(sample_labels()), state.labels().expect("readable"));
    assert_eq!(
        Some(sample_milestones()),
        state.milestones().expect("readable")
    );
}

#[test]
fn replace_project_config_labels_and_milestones_can_clear_all_to_none() {
    let state = AppState::new();
    state
        .replace_project_config_labels_and_milestones(
            Some(PathBuf::from("/tmp/project")),
            Some(sample_config()),
            Some(sample_labels()),
            Some(sample_milestones()),
        )
        .expect("writable");

    state
        .replace_project_config_labels_and_milestones(None, None, None, None)
        .expect("writable");

    assert_eq!(None, state.project_path().expect("readable"));
    assert_eq!(None, state.config().expect("readable"));
    assert_eq!(None, state.labels().expect("readable"));
    assert_eq!(None, state.milestones().expect("readable"));
}

/// `sample_config` に cardOrder を 1 件足した「移動後」相当の Config。
fn config_with_card_order(column: &str, paths: &[&str]) -> Config {
    let mut config = sample_config();
    config.card_order.insert(
        column.to_string(),
        paths.iter().map(|p| (*p).to_string()).collect(),
    );
    config
}

#[test]
fn replace_config_and_tasks_applies_both_when_project_matches() {
    let state = AppState::new();
    let root = PathBuf::from("/project");
    state
        .set_project_path(Some(root.clone()))
        .expect("set path");
    state.replace_config(Some(sample_config())).expect("config");
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("tasks/a.md"), sample_task("a", "tasks/a.md"));
    state.replace_tasks_cache(cache).expect("cache");

    let result = state
        .replace_config_and_tasks_if_project_matches(
            &root,
            config_with_card_order("Todo", &["tasks/a.md"]),
            |cache| -> Result<usize, ()> {
                cache.insert(PathBuf::from("tasks/b.md"), sample_task("b", "tasks/b.md"));
                Ok(cache.len())
            },
        )
        .expect("no poison");

    assert_eq!(result, Some(Ok(2)));
    let config = state.config().expect("readable").expect("some");
    assert_eq!(
        config.card_order.get("Todo"),
        Some(&vec!["tasks/a.md".to_string()])
    );
    assert_eq!(state.tasks_snapshot().expect("readable").len(), 2);
}

#[test]
fn replace_config_and_tasks_changes_nothing_when_project_differs() {
    let state = AppState::new();
    state
        .set_project_path(Some(PathBuf::from("/other")))
        .expect("set path");
    state.replace_config(Some(sample_config())).expect("config");
    state.replace_tasks_cache(HashMap::new()).expect("cache");

    let result = state
        .replace_config_and_tasks_if_project_matches(
            &PathBuf::from("/project"),
            config_with_card_order("Todo", &["tasks/a.md"]),
            |cache| -> Result<(), ()> {
                cache.insert(PathBuf::from("tasks/a.md"), sample_task("a", "tasks/a.md"));
                Ok(())
            },
        )
        .expect("no poison");

    assert!(result.is_none());
    let config = state.config().expect("readable").expect("some");
    assert!(config.card_order.is_empty(), "config は変更されない");
    assert!(
        state.tasks_snapshot().expect("readable").is_empty(),
        "tasks も変更されない"
    );
}

#[test]
fn replace_config_and_tasks_keeps_config_untouched_when_task_update_fails() {
    // cache 更新が失敗した場合に config だけが移動後で確定すると、
    // 「config は移動後・tasks は移動前」の部分適用が in-memory に残る。
    let state = AppState::new();
    let root = PathBuf::from("/project");
    state
        .set_project_path(Some(root.clone()))
        .expect("set path");
    state.replace_config(Some(sample_config())).expect("config");
    state.replace_tasks_cache(HashMap::new()).expect("cache");

    let result = state
        .replace_config_and_tasks_if_project_matches(
            &root,
            config_with_card_order("Todo", &["tasks/a.md"]),
            |_cache| -> Result<(), &'static str> { Err("vanished") },
        )
        .expect("no poison");

    assert_eq!(result, Some(Err("vanished")));
    let config = state.config().expect("readable").expect("some");
    assert!(
        config.card_order.is_empty(),
        "cache 更新失敗時に config を確定してはならない"
    );
}

// ───────── snapshot_config_tasks_and_session ─────────

fn column(name: &str, order: u32) -> Column {
    Column {
        name: name.into(),
        order,
        color: None,
    }
}

#[test]
fn snapshot_config_tasks_and_session_returns_both_fields_when_committed() {
    let state = AppState::new();
    let mut config = sample_config();
    config.columns = vec![column("Todo", 0), column("Doing", 1), column("Done", 2)];
    state.replace_config(Some(config)).expect("writable");
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b", "b.md"));
    state.replace_tasks_cache(cache).expect("writable");

    let ctx = state.snapshot_config_tasks_and_session().expect("readable");

    assert_eq!(ctx.config.expect("config").columns.len(), 3);
    assert_eq!(ctx.tasks.len(), 2);
}

#[test]
fn snapshot_config_tasks_and_session_returns_none_config_and_empty_tasks_when_uninitialized() {
    let state = AppState::new();

    let ctx = state.snapshot_config_tasks_and_session().expect("readable");

    assert!(ctx.config.is_none());
    assert!(ctx.tasks.is_empty());
}

#[test]
fn snapshot_config_tasks_and_session_returns_cloned_tasks_unaffected_by_later_writes() {
    let state = AppState::new();
    let mut cache = HashMap::new();
    cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
    cache.insert(PathBuf::from("b.md"), sample_task("b", "b.md"));
    state.replace_tasks_cache(cache.clone()).expect("writable");
    let ctx = state.snapshot_config_tasks_and_session().expect("readable");

    cache.insert(PathBuf::from("c.md"), sample_task("c", "c.md"));
    state.replace_tasks_cache(cache).expect("writable");

    assert_eq!(ctx.tasks.len(), 2);
}

#[test]
fn snapshot_config_tasks_and_session_reports_config_lock_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.config.lock().expect("lockable before panic");
        panic!("poison config");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .snapshot_config_tasks_and_session()
            .expect_err("poisoned read")
    );
}

#[test]
fn snapshot_config_tasks_and_session_reports_tasks_cache_lock_poison() {
    let state = Arc::new(AppState::new());
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.tasks_cache.lock().expect("lockable before panic");
        panic!("poison tasks_cache");
    });

    assert_eq!(
        AppStateError::LockPoisoned,
        state
            .snapshot_config_tasks_and_session()
            .expect_err("poisoned read")
    );
}

// ───────── revision / generation / eventSeq ─────────

fn cache_with(entries: &[(&str, &str)]) -> HashMap<PathBuf, Task> {
    entries
        .iter()
        .map(|(id, path)| (PathBuf::from(*path), sample_task(id, path)))
        .collect()
}

#[test]
fn new_initializes_generation_revision_and_event_seq_to_zero() {
    let state = AppState::new();

    let session = state
        .snapshot_config_tasks_and_session()
        .expect("readable")
        .session;

    assert_eq!(0, state.project_generation().as_u64());
    assert_eq!(0, state.tasks_revision().as_u64());
    assert_eq!(0, session.event_seq.as_u64());
}

#[test]
fn with_tasks_cache_mut_revision_bumps_revision_and_returns_it() {
    let state = AppState::new();

    let (inserted, revision) = state
        .with_tasks_cache_mut_revision(|cache| {
            cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
            cache.len()
        })
        .expect("writable");

    assert_eq!(1, inserted);
    assert_eq!(1, revision.as_u64());
    assert_eq!(1, state.tasks_revision().as_u64());
}

#[test]
fn with_tasks_cache_mut_bumps_revision_even_when_closure_leaves_cache_untouched() {
    let state = AppState::new();

    state
        .with_tasks_cache_mut(|cache| cache.len())
        .expect("writable");

    assert_eq!(
        1,
        state.tasks_revision().as_u64(),
        "closure の中身は検査できないので空振りでも bump する"
    );
}

#[test]
fn replace_tasks_cache_revision_replaces_all_entries_and_bumps_revision() {
    let state = AppState::new();
    state
        .replace_tasks_cache(cache_with(&[("a", "a.md")]))
        .expect("writable");

    let revision = state
        .replace_tasks_cache_revision(cache_with(&[("b", "b.md")]))
        .expect("writable");

    assert_eq!(2, revision.as_u64());
    let paths: Vec<String> = state
        .tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|task| task.file_path.into_string())
        .collect();
    assert_eq!(vec!["b.md".to_string()], paths);
}

#[test]
fn replace_config_and_tasks_if_project_matches_bumps_revision_only_when_update_succeeds() {
    let state = AppState::new();
    let root = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(root.clone()))
        .expect("writable");

    state
        .replace_config_and_tasks_if_project_matches(&root, sample_config(), |cache| {
            cache.insert(PathBuf::from("a.md"), sample_task("a", "a.md"));
            Ok::<(), ()>(())
        })
        .expect("writable")
        .expect("path matches")
        .expect("update ok");
    assert_eq!(1, state.tasks_revision().as_u64());

    state
        .replace_config_and_tasks_if_project_matches(&root, sample_config(), |_cache| {
            Err::<(), ()>(())
        })
        .expect("writable")
        .expect("path matches")
        .expect_err("update fails");
    assert_eq!(
        1,
        state.tasks_revision().as_u64(),
        "update_tasks が Err なら cache は変わらないので revision も進めない"
    );

    state
        .replace_config_and_tasks_if_project_matches(
            &PathBuf::from("/tmp/other"),
            sample_config(),
            |_cache| Ok::<(), ()>(()),
        )
        .expect("writable");
    assert_eq!(
        1,
        state.tasks_revision().as_u64(),
        "project 不一致では cache に触れないので revision も進めない"
    );
}

#[test]
fn install_project_session_commits_cache_and_returns_the_committed_session() {
    let state = AppState::new();
    let root = PathBuf::from("/tmp/project");

    let session = state
        .install_project_session(&root, cache_with(&[("a", "a.md")]))
        .expect("writable");

    assert_eq!("/tmp/project", session.project_key.as_str());
    assert_eq!(1, session.generation.as_u64());
    assert_eq!(1, session.revision.as_u64());
    assert_eq!(0, session.event_seq.as_u64());
    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
    assert_eq!(1, state.project_generation().as_u64());
}

#[test]
fn install_project_session_increments_generation_on_every_open() {
    let state = AppState::new();
    let root = PathBuf::from("/tmp/project");

    state
        .install_project_session(&root, HashMap::new())
        .expect("writable");
    let second = state
        .install_project_session(&root, HashMap::new())
        .expect("writable");

    assert_eq!(2, second.generation.as_u64());
}

#[test]
fn install_project_session_carries_the_current_event_seq_watermark() {
    let state = AppState::new();
    state.next_event_seq();
    state.next_event_seq();

    let session = state
        .install_project_session(&PathBuf::from("/tmp/project"), HashMap::new())
        .expect("writable");

    assert_eq!(2, session.event_seq.as_u64());
}

#[test]
fn snapshot_config_tasks_and_session_reports_the_revision_of_the_returned_tasks() {
    let state = AppState::new();
    let root = PathBuf::from("/tmp/project");
    state
        .set_project_path(Some(root.clone()))
        .expect("writable");
    state
        .replace_config(Some(sample_config()))
        .expect("writable");
    let installed = state
        .install_project_session(&root, cache_with(&[("a", "a.md"), ("b", "b.md")]))
        .expect("writable");

    let context = state.snapshot_config_tasks_and_session().expect("readable");

    assert_eq!(2, context.tasks.len());
    assert_eq!(installed.revision, context.session.revision);
    assert_eq!(installed.generation, context.session.generation);
    assert_eq!("/tmp/project", context.session.project_key.as_str());
}

#[test]
fn next_event_seq_increases_monotonically_without_repeating() {
    let state = AppState::new();

    let seqs: Vec<u64> = (0..5).map(|_| state.next_event_seq().as_u64()).collect();

    assert_eq!(vec![1, 2, 3, 4, 5], seqs);
}

#[test]
fn tasks_revision_stays_readable_when_tasks_cache_is_poisoned() {
    let state = Arc::new(AppState::new());
    state
        .replace_tasks_cache_revision(HashMap::new())
        .expect("writable");
    poison_mutex(Arc::clone(&state), |s| {
        let _guard = s.tasks_cache.lock().expect("lockable before panic");
        panic!("poison tasks_cache");
    });

    assert_eq!(
        1,
        state.tasks_revision().as_u64(),
        "revision は AtomicU64 なので tasks_cache の poison に巻き込まれない"
    );
}

#[test]
fn revision_keeps_increasing_across_project_switches() {
    let state = AppState::new();

    state
        .install_project_session(&PathBuf::from("/tmp/a"), HashMap::new())
        .expect("writable");
    let switched = state
        .install_project_session(&PathBuf::from("/tmp/b"), HashMap::new())
        .expect("writable");

    assert_eq!(
        2,
        switched.revision.as_u64(),
        "project 往復で同じ revision が再出現すると FE が版を誤判定する"
    );
}

#[test]
fn concurrent_mutations_never_hand_out_the_same_revision() {
    let state = Arc::new(AppState::new());
    let threads: Vec<_> = (0..8)
        .map(|_| {
            let state = Arc::clone(&state);
            thread::spawn(move || {
                let (_, revision) = state
                    .with_tasks_cache_mut_revision(|cache| cache.len())
                    .expect("writable");
                revision.as_u64()
            })
        })
        .collect();

    let mut revisions: Vec<u64> = threads
        .into_iter()
        .map(|handle| handle.join().expect("thread ok"))
        .collect();
    revisions.sort_unstable();

    assert_eq!((1..=8).collect::<Vec<u64>>(), revisions);
}

#[test]
fn replace_tasks_cache_if_unchanged_rejects_a_concurrent_config_swap() {
    let state = AppState::new();
    state
        .replace_config(Some(sample_config()))
        .expect("writable");
    let expected_revision = state.tasks_revision();
    let expected_status: ColumnName = "Todo".into();

    // 走査中に config だけ差し替わり、revision はまだ進んでいない状況。
    let mut swapped = sample_config();
    swapped.columns = vec![Column {
        name: "Backlog".into(),
        order: 0,
        color: None,
    }];
    state.replace_config(Some(swapped)).expect("writable");

    let applied = state
        .replace_tasks_cache_if_unchanged(
            expected_revision,
            &expected_status,
            cache_with(&[("a", "a.md")]),
        )
        .expect("writable");

    assert_eq!(
        None, applied,
        "既定 status が変わったのに置換すると、status 欠損 task が旧カラムに残る"
    );
    assert!(state.tasks_snapshot().expect("readable").is_empty());
}

#[test]
fn replace_tasks_cache_if_unchanged_applies_when_revision_and_status_hold() {
    let state = AppState::new();
    state
        .replace_config(Some(sample_config()))
        .expect("writable");

    let applied = state
        .replace_tasks_cache_if_unchanged(
            state.tasks_revision(),
            &"Todo".into(),
            cache_with(&[("a", "a.md")]),
        )
        .expect("writable");

    assert_eq!(Some(1), applied.map(|revision| revision.as_u64()));
    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
}
