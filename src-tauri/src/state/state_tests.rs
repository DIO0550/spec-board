use super::{AppState, AppStateError, BoxedWatcherHandle};

use std::collections::HashMap;
use std::panic::{self, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

use spec_board_fs::watcher::handle::WatcherHandle;

use crate::config::{CardOrder, Column, Config, LabelDefinition, LabelRegistry};
use crate::task::task_index::Task;

fn sample_task(id: &str, file_path: &str) -> Task {
    Task {
        id: id.into(),
        file_path: file_path.into(),
        title: format!("title-{id}").into(),
        status: "Todo".into(),
        priority: None,
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
fn replace_project_config_and_labels_swaps_three_fields() {
    let state = AppState::new();
    let path = PathBuf::from("/tmp/project");
    state
        .replace_project_config_and_labels(
            Some(path.clone()),
            Some(sample_config()),
            Some(sample_labels()),
        )
        .expect("writable");

    assert_eq!(Some(path), state.project_path().expect("readable"));
    assert_eq!(Some(sample_config()), state.config().expect("readable"));
    assert_eq!(Some(sample_labels()), state.labels().expect("readable"));
}

#[test]
fn replace_project_config_and_labels_can_clear_all_to_none() {
    let state = AppState::new();
    state
        .replace_project_config_and_labels(
            Some(PathBuf::from("/tmp/project")),
            Some(sample_config()),
            Some(sample_labels()),
        )
        .expect("writable");

    state
        .replace_project_config_and_labels(None, None, None)
        .expect("writable");

    assert_eq!(None, state.project_path().expect("readable"));
    assert_eq!(None, state.config().expect("readable"));
    assert_eq!(None, state.labels().expect("readable"));
}
