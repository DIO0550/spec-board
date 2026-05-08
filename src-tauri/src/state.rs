//! アプリケーション全体で共有するグローバル状態 `AppState`。
//!
//! Tauri command（`open_project` / `get_tasks` 等、後続 Issue で実装予定）が
//! 共有するアプリ状態を集約する。各フィールドは独立した `Mutex` で保護され、
//! フィールド単位で lock 競合を最小化する。
//!
//! # Lock 取得順序
//!
//! 複数フィールドの lock を同時に取得する場合は、必ず以下の順序で取得すること。
//! AB-BA デッドロックを防ぐための運用規約である。
//!
//! ```text
//! project_path → config → tasks_cache → watcher_handle → write_ignore
//! ```
//!
//! - 単一フィールドのみを操作するアクセサは順序を意識する必要はない。
//! - `write_ignore` は `WriteIgnoreRegistry` 内部で独自の `Mutex` を持つため、
//!   AppState の他フィールドの lock を保持したまま `write_ignore` API を呼ぶ
//!   場合は常に最後（最下層）として扱うこと。
//!
//! # フィールドカプセル化
//!
//! `AppState` の `Mutex` フィールドはすべて private にしてある。
//! 公開アクセサを通すことで以下を保証する。
//!
//! - `AppState` 自身が保持する `Mutex`（`project_path` / `config` /
//!   `tasks_cache` / `watcher_handle`）の `PoisonError` を
//!   `AppStateError::LockPoisoned` へ統一変換する。
//!   ただし `write_ignore` は `WriteIgnoreRegistry` 内部で独自の `Mutex` を
//!   持つため例外で、forwarder 経由の操作は `WriteIgnoreError::LockPoisoned`
//!   をそのまま返す（`AppStateError` には変換しない）。
//! - lock 取得順序の運用規約を caller に強制する。
//! - `watcher_handle` の差し替え時に必ず旧ハンドルへ `stop()` を呼ぶ
//!   不変条件を維持する。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use thiserror::Error;

use spec_board_fs::watcher_handle::WatcherHandle;
use spec_board_fs::write_ignore::WriteIgnoreRegistry;

use crate::config::Config;
use crate::task_index::Task;

/// `tauri::Builder::manage` に渡すために `'static` を含む trait object 型。
pub type BoxedWatcherHandle = Box<dyn WatcherHandle + Send + 'static>;

/// `AppState` のロック関連エラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum AppStateError {
    /// いずれかの内部 `Mutex` が poison 状態にあり、ロックを取得できなかった。
    #[error("app state lock poisoned")]
    LockPoisoned,
}

/// アプリ全体で共有するグローバル状態。
///
/// `tauri::Builder::manage(AppState::new())` で登録し、command 関数では
/// `state: tauri::State<'_, AppState>` として注入する。
///
/// 全フィールドは private。caller は公開アクセサを通じてのみ操作できる。
pub struct AppState {
    project_path: Mutex<Option<PathBuf>>,
    config: Mutex<Option<Config>>,
    tasks_cache: Mutex<HashMap<PathBuf, Task>>,
    write_ignore: WriteIgnoreRegistry,
    watcher_handle: Mutex<Option<BoxedWatcherHandle>>,
}

impl AppState {
    /// 全フィールドを初期状態にした `AppState` を生成する。
    ///
    /// `project_path` / `config` / `watcher_handle` は `None`、
    /// `tasks_cache` は空 HashMap、`write_ignore` は空 registry になる。
    ///
    /// 初期化エントリーポイントは `new()` のみとし、`Default` 実装は意図的に
    /// 提供しない。
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {
            project_path: Mutex::new(None),
            config: Mutex::new(None),
            tasks_cache: Mutex::new(HashMap::new()),
            write_ignore: WriteIgnoreRegistry::new(),
            watcher_handle: Mutex::new(None),
        }
    }

    /// 現在保持している project root のパスを clone して返す。
    pub fn project_path(&self) -> Result<Option<PathBuf>, AppStateError> {
        let guard = lock(&self.project_path)?;
        Ok(guard.clone())
    }

    /// project root のパスを上書きする。`None` を渡すとリセットになる。
    pub fn set_project_path(&self, path: Option<PathBuf>) -> Result<(), AppStateError> {
        let mut guard = lock(&self.project_path)?;
        *guard = path;
        Ok(())
    }

    /// 現在保持している `Config` を clone して返す。
    pub fn config(&self) -> Result<Option<Config>, AppStateError> {
        let guard = lock(&self.config)?;
        Ok(guard.clone())
    }

    /// `Config` を丸ごと差し替える。`None` を渡すと未保持状態に戻せる。
    pub fn replace_config(&self, config: Option<Config>) -> Result<(), AppStateError> {
        let mut guard = lock(&self.config)?;
        *guard = config;
        Ok(())
    }

    /// タスクキャッシュ全体を新しい map で置き換える。
    ///
    /// 旧エントリは破棄されるため部分更新には使えない。`PathBuf` は呼び出し側
    /// が用意した形（`canonicalize()` 適用有無等）のままで保持する。
    pub fn replace_tasks_cache(&self, cache: HashMap<PathBuf, Task>) -> Result<(), AppStateError> {
        let mut guard = lock(&self.tasks_cache)?;
        *guard = cache;
        Ok(())
    }

    /// 現在キャッシュしている `Task` の値を `Vec` として複製して返す。
    ///
    /// 呼び出し時点のスナップショットであり、戻り値の順序は不定。
    pub fn tasks_snapshot(&self) -> Result<Vec<Task>, AppStateError> {
        let guard = lock(&self.tasks_cache)?;
        Ok(guard.values().cloned().collect())
    }

    /// watcher ハンドルを差し替える。
    ///
    /// 旧ハンドルが存在する場合は、新ハンドルを置く前に `stop()` を呼び出す。
    /// 旧ハンドルの `stop()` が panic した場合はそのまま伝播し、`watcher_handle`
    /// の `Mutex` は poison する。次回アクセサで `LockPoisoned` が返る。
    /// なお panic は guard 保持中に発生するため、新ハンドルは install されない。
    pub fn install_watcher_handle(&self, handle: BoxedWatcherHandle) -> Result<(), AppStateError> {
        let mut guard = lock(&self.watcher_handle)?;
        if let Some(existing) = guard.as_mut() {
            existing.stop();
        }
        *guard = Some(handle);
        Ok(())
    }

    /// watcher ハンドルを取り出して `None` 状態に戻す。
    ///
    /// 取り出された旧ハンドルの `stop()` 呼び出しは caller の責務。
    pub fn take_watcher_handle(&self) -> Result<Option<BoxedWatcherHandle>, AppStateError> {
        let mut guard = lock(&self.watcher_handle)?;
        Ok(guard.take())
    }

    /// `WriteIgnoreRegistry` への参照を返す forwarder。
    ///
    /// registry は内部に独自の `Mutex` を持つため、`AppState` 側では別途 lock を
    /// 取らない。他フィールドの lock を保持したまま呼ぶ場合は、lock 取得順序
    /// の最下層として扱うこと。
    pub fn write_ignore(&self) -> &WriteIgnoreRegistry {
        &self.write_ignore
    }
}

/// 共通 lock ヘルパー。`PoisonError` を `AppStateError::LockPoisoned` に統一する。
fn lock<T>(m: &Mutex<T>) -> Result<MutexGuard<'_, T>, AppStateError> {
    m.lock().map_err(|_| AppStateError::LockPoisoned)
}

#[cfg(test)]
mod tests {
    use super::{AppState, AppStateError, BoxedWatcherHandle};

    use std::collections::HashMap;
    use std::panic::{self, AssertUnwindSafe};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;

    use spec_board_fs::watcher_handle::WatcherHandle;

    use crate::config::{CardOrder, Column, Config};
    use crate::task_index::Task;

    fn sample_task(id: &str, file_path: &str) -> Task {
        Task {
            id: id.to_string(),
            file_path: file_path.to_string(),
            title: format!("title-{id}"),
            status: "Todo".to_string(),
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

    fn sample_config() -> Config {
        Config {
            version: 1,
            columns: vec![Column {
                name: "Todo".to_string(),
                order: 0,
            }],
            card_order: CardOrder::default(),
            done_column: None,
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
}
