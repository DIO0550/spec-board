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

use spec_board_fs::watcher::handle::WatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

use crate::config::Config;
use crate::task::task_index::Task;

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
    watcher_handle: Mutex<Option<BoxedWatcherHandle>>,
    write_ignore: WriteIgnoreRegistry,
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
            watcher_handle: Mutex::new(None),
            write_ignore: WriteIgnoreRegistry::new(),
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

    /// `tasks_cache` を可変で借りて closure 内で in-place 操作する。
    ///
    /// `tasks_snapshot` → 編集 → `replace_tasks_cache` のフローでは全 task を
    /// clone してから新 HashMap で書き戻すため O(n) のコピーが発生する。
    /// 1 path 単位の差分更新（watcher 由来の created / updated / deleted など）
    /// では本 API を使うことで O(1) のロック内 in-place 更新ができる。
    ///
    /// closure は guard を保持したまま呼ばれるため、内部で AppState の他
    /// アクセサを呼んではならない（自己 deadlock の原因）。
    pub fn with_tasks_cache_mut<F, R>(&self, f: F) -> Result<R, AppStateError>
    where
        F: FnOnce(&mut HashMap<PathBuf, Task>) -> R,
    {
        let mut guard = lock(&self.tasks_cache)?;
        Ok(f(&mut guard))
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

    /// `watcher_handle` が install 済みかを返す非破壊 accessor。
    ///
    /// `take_watcher_handle` と異なり handle を取り出さず、`Mutex` 内の
    /// `Option<BoxedWatcherHandle>` の `is_some()` のみを返す。
    pub fn is_watcher_installed(&self) -> Result<bool, AppStateError> {
        let guard = lock(&self.watcher_handle)?;
        Ok(guard.is_some())
    }

    /// `project_path` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `project_path()` と異なりクローンを行わないため、pre-flight 用途で
    /// 大きな PathBuf をコピーするコストを避けられる。
    pub fn check_project_path_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.project_path)?;
        Ok(())
    }

    /// `config` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `config()` と異なりクローンを行わないため、pre-flight 用途で
    /// `Config` のコピーコストを避けられる。
    pub fn check_config_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.config)?;
        Ok(())
    }

    /// `tasks_cache` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `tasks_snapshot()` と異なり全 `Task` の clone+collect を行わないため、
    /// 既存プロジェクトが大きい場合でも O(1) で lock 健全性のみ確認できる。
    pub fn check_tasks_cache_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.tasks_cache)?;
        Ok(())
    }

    /// `watcher_handle` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `install_watcher_handle` などの破壊的操作を行う前に lock の poison を
    /// 早期検出するための pre-flight 用 API。lock を取得して即解放するだけで、
    /// 内部状態は変更しない。
    pub fn check_watcher_handle_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.watcher_handle)?;
        Ok(())
    }

    /// AppState が保持する 4 つの `Mutex` フィールドすべての lock 健全性を
    /// 一括 probe する副作用なしの API。
    ///
    /// `WriteIgnoreRegistry` は AppState の `Mutex` ではなく内部に独自の
    /// `Mutex` を持つため対象外。caller が必要なら
    /// `state.write_ignore().is_empty()?` 等を組み合わせて確認する。
    pub fn check_all_locks(&self) -> Result<(), AppStateError> {
        self.check_project_path_lock()?;
        self.check_config_lock()?;
        self.check_tasks_cache_lock()?;
        self.check_watcher_handle_lock()?;
        Ok(())
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
mod state_tests;
