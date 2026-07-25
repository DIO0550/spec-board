//! アプリケーション全体で共有するグローバル状態 `AppState`。
//!
//! `open_project` / `get_tasks` 等の Tauri command が共有するアプリ状態を集約する。
//! 各フィールドは独立した `Mutex` で保護され、フィールド単位で lock 競合を最小化する。
//!
//! # Lock 取得順序
//!
//! 複数フィールドの lock を同時に取得する場合は、必ず以下の順序で取得すること。
//! AB-BA デッドロックを防ぐための運用規約である。
//!
//! ```text
//! project_path → config → labels → milestones → tasks_cache → watcher_handle → write_ignore
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
//!   `labels` / `milestones` / `tasks_cache` / `watcher_handle`）の `PoisonError` を
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

use crate::config::{Config, LabelRegistry, MilestoneRegistry};
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
    labels: Mutex<Option<LabelRegistry>>,
    milestones: Mutex<Option<MilestoneRegistry>>,
    tasks_cache: Mutex<HashMap<PathBuf, Task>>,
    watcher_handle: Mutex<Option<BoxedWatcherHandle>>,
    write_ignore: WriteIgnoreRegistry,
}

/// ラベル `create` / `update` コマンドが書き込み前に必要とするスナップショット。
///
/// `project_path` と `labels` を **同一の lock 取得トランザクション**で観測した値を
/// まとめて運ぶ。複数フィールドの取得を `snapshot_..._and_...` のように `and` 連結した
/// 関数名で表す代わりに、運ぶ内容を表す専用 context 型として定義する。
#[derive(Debug, Clone)]
pub struct LabelWriteContext {
    /// snapshot 時点の project root。未オープン時は `None`。
    pub project_root: Option<PathBuf>,
    /// snapshot 時点のラベルレジストリ。未オープン時は `None`。
    pub labels: Option<LabelRegistry>,
}

/// ラベル `delete` コマンドが書き込み前に必要とするスナップショット。
///
/// 削除前 usageCount を「labels と tasks の整合した観測」から算出するため、
/// `project_path` / `labels` に加えて `tasks_cache` も同一トランザクションで取得する。
#[derive(Debug, Clone)]
pub struct LabelDeleteContext {
    /// snapshot 時点の project root。未オープン時は `None`。
    pub project_root: Option<PathBuf>,
    /// snapshot 時点のラベルレジストリ。未オープン時は `None`。
    pub labels: Option<LabelRegistry>,
    /// snapshot 時点の全タスク（usageCount 算出用）。
    pub tasks: Vec<Task>,
}

/// マイルストーン `create` / `update` コマンドが書き込み前に必要とするスナップショット。
///
/// `LabelWriteContext` と同型。`project_path` と `milestones` を同一の lock 取得
/// トランザクションで観測した値をまとめて運ぶ。
#[derive(Debug, Clone)]
pub struct MilestoneWriteContext {
    /// snapshot 時点の project root。未オープン時は `None`。
    pub project_root: Option<PathBuf>,
    /// snapshot 時点のマイルストーンレジストリ。未オープン時は `None`。
    pub milestones: Option<MilestoneRegistry>,
}

/// マイルストーン `delete` コマンドが書き込み前に必要とするスナップショット。
///
/// 削除前 usageCount を「milestones と tasks の整合した観測」から算出するため、
/// `project_path` / `milestones` に加えて `tasks_cache` も同一トランザクションで取得する。
#[derive(Debug, Clone)]
pub struct MilestoneDeleteContext {
    /// snapshot 時点の project root。未オープン時は `None`。
    pub project_root: Option<PathBuf>,
    /// snapshot 時点のマイルストーンレジストリ。未オープン時は `None`。
    pub milestones: Option<MilestoneRegistry>,
    /// snapshot 時点の全タスク（usageCount 算出用）。
    pub tasks: Vec<Task>,
}

impl AppState {
    /// 全フィールドを初期状態にした `AppState` を生成する。
    ///
    /// `project_path` / `config` / `labels` / `watcher_handle` は `None`、
    /// `tasks_cache` は空 HashMap、`write_ignore` は空 registry になる。
    ///
    /// 初期化エントリーポイントは `new()` のみとし、`Default` 実装は意図的に
    /// 提供しない。
    // `Default` を生やすと AppState の生成経路が `new()` と `default()` に分かれ、
    // どちらで初期化されたかが呼び出し側で曖昧になる。アプリ状態の生成は 1 本に
    // 限定したいので、Default を伴わない `new()` への clippy の指摘は意図的に抑止する。
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {
            project_path: Mutex::new(None),
            config: Mutex::new(None),
            labels: Mutex::new(None),
            milestones: Mutex::new(None),
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

    /// 現在保持している `LabelRegistry` を clone して返す。
    ///
    /// プロジェクト未オープン時は `None`。labels.yml 不在で開いた場合は
    /// `Some(LabelRegistry::default())`（空レジストリ）が入る。
    pub fn labels(&self) -> Result<Option<LabelRegistry>, AppStateError> {
        let guard = lock(&self.labels)?;
        Ok(guard.clone())
    }

    /// `LabelRegistry` を丸ごと差し替える。`None` を渡すと未保持状態に戻せる。
    pub fn replace_labels(&self, labels: Option<LabelRegistry>) -> Result<(), AppStateError> {
        let mut guard = lock(&self.labels)?;
        *guard = labels;
        Ok(())
    }

    /// 現在保持している `MilestoneRegistry` を clone して返す。
    ///
    /// プロジェクト未オープン時は `None`。milestones.yml 不在で開いた場合は
    /// `Some(MilestoneRegistry::default())`（空レジストリ）が入る。
    pub fn milestones(&self) -> Result<Option<MilestoneRegistry>, AppStateError> {
        let guard = lock(&self.milestones)?;
        Ok(guard.clone())
    }

    /// `MilestoneRegistry` を丸ごと差し替える。`None` を渡すと未保持状態に戻せる。
    pub fn replace_milestones(
        &self,
        milestones: Option<MilestoneRegistry>,
    ) -> Result<(), AppStateError> {
        let mut guard = lock(&self.milestones)?;
        *guard = milestones;
        Ok(())
    }

    /// `project_path` と `config` を**両方の lock を順に同時保持した状態で** snapshot する。
    ///
    /// 一方の lock だけを取得して順に読むと、両フィールドを別々に更新する writer と
    /// 割り込み合った際に「新 project_path + 旧 config」または「旧 project_path + 新 config」
    /// の組を観測してしまう。本 API は両 lock を順に同時保持して両フィールドを clone する
    /// ことで、その不整合観測を防ぐ atomic 読み取り API として機能する。lock 取得順序は
    /// AppState の契約に従って `project_path → config` を遵守する。
    ///
    /// 同時更新側は [`Self::replace_project_config_labels_and_milestones`] / [`Self::replace_config_if_project_matches`]
    /// で同様に両 lock を同時保持して書き換えることで、reader 側の観測整合性を確保する。
    ///
    /// 戻り値はそれぞれ clone 済み snapshot のため、呼び出し側が長く保持しても
    /// AppState 側の lock は保持されない。
    pub fn snapshot_project_and_config(
        &self,
    ) -> Result<(Option<PathBuf>, Option<crate::config::Config>), AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let config_guard = lock(&self.config)?;
        Ok((path_guard.clone(), config_guard.clone()))
    }

    /// `project_path` / `config` / `labels` / `milestones` を**4 つの lock を順に同時保持
    /// した状態で** swap する。
    ///
    /// 各フィールドを別 lock で順次更新すると、その間に reader（例:
    /// `update_card_order`）が「新 path + 旧 config」を観測し、旧 config を新
    /// プロジェクトの `config.json` に書き出してしまう cross-project corruption が
    /// 起き得る。本 API は 4 つの lock を保持したまま swap することでその不整合を防ぐ。
    /// lock 取得順序は AppState の契約に従って `project_path → config → labels → milestones`
    /// を遵守する。
    ///
    /// commit の整合範囲は `project_path / config / labels / milestones` の 4 フィールドに
    /// 限定され、`tasks_cache` 等との間は従来どおり非 atomic（別更新）である。
    pub fn replace_project_config_labels_and_milestones(
        &self,
        path: Option<PathBuf>,
        config: Option<crate::config::Config>,
        labels: Option<LabelRegistry>,
        milestones: Option<MilestoneRegistry>,
    ) -> Result<(), AppStateError> {
        let mut path_guard = lock(&self.project_path)?;
        let mut config_guard = lock(&self.config)?;
        let mut labels_guard = lock(&self.labels)?;
        let mut milestones_guard = lock(&self.milestones)?;
        *path_guard = path;
        *config_guard = config;
        *labels_guard = labels;
        *milestones_guard = milestones;
        Ok(())
    }

    /// 現在の `project_path` が `expected_path` と一致する場合のみ `config` を更新する。
    ///
    /// `snapshot_project_and_config` で読んだ snapshot を mutate して書き戻す flow で、
    /// snapshot 取得から書き戻しまでの間に `open_project` が project を swap した
    /// ケースを検出するための atomic check-and-set。lock 取得順序は
    /// `project_path → config` を遵守する。
    ///
    /// - `expected_path` が一致 → `config` を更新して `Ok(true)`
    /// - 不一致（並行 `open_project` 等） → 何も変更せず `Ok(false)`
    pub fn replace_config_if_project_matches(
        &self,
        expected_path: &std::path::Path,
        config: crate::config::Config,
    ) -> Result<bool, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let mut config_guard = lock(&self.config)?;
        if path_guard.as_deref() == Some(expected_path) {
            *config_guard = Some(config);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// `project_path` と `labels` を**両方の lock を順に同時保持した状態で** snapshot する。
    ///
    /// `create_label` / `update_label` が書き込み前に使う。別々に `project_path()?` →
    /// `labels()?` と取得すると、その間に `open_project` が project を swap して
    /// 「新 path + 旧 labels」を観測する race window が生じる。本 API は両 lock を順に
    /// 同時保持して両フィールドを clone することで整合 snapshot を返す。lock 取得順序は
    /// AppState の契約に従って `project_path → labels` を遵守する。
    pub fn snapshot_label_write(&self) -> Result<LabelWriteContext, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let labels_guard = lock(&self.labels)?;
        Ok(LabelWriteContext {
            project_root: path_guard.clone(),
            labels: labels_guard.clone(),
        })
    }

    /// `project_path` / `labels` / `tasks_cache` を**3 つの lock を順に同時保持した状態で**
    /// snapshot する。
    ///
    /// `delete_label` が使う。削除前 usageCount は「削除前に何件のタスクで使われていたか」
    /// という操作結果のため、labels と tasks を整合した 1 回の観測から算出する必要がある
    /// （別々に取得すると不整合な組を観測し得る）。lock 取得順序は AppState の契約に従って
    /// `project_path → labels → tasks_cache` を遵守する。
    pub fn snapshot_label_delete(&self) -> Result<LabelDeleteContext, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let labels_guard = lock(&self.labels)?;
        let tasks_guard = lock(&self.tasks_cache)?;
        Ok(LabelDeleteContext {
            project_root: path_guard.clone(),
            labels: labels_guard.clone(),
            tasks: tasks_guard.values().cloned().collect(),
        })
    }

    /// 現在の `project_path` が `expected_path` と一致する場合のみ `labels` を差し替える。
    ///
    /// `snapshot_label_write` / `snapshot_label_delete` で読んだ snapshot を mutate し
    /// disk write 成功後に書き戻す flow で、snapshot 取得から書き戻しまでの間に
    /// `open_project` が project を swap したケースを検出するための atomic check-and-set。
    /// lock 取得順序は `project_path → labels` を遵守する。
    ///
    /// - `expected_path` が一致 → `labels` を更新して `Ok(true)`
    /// - 不一致（並行 `open_project` 等） → 何も変更せず `Ok(false)`
    pub fn replace_labels_if_project_matches(
        &self,
        expected_path: &std::path::Path,
        labels: LabelRegistry,
    ) -> Result<bool, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let mut labels_guard = lock(&self.labels)?;
        if path_guard.as_deref() == Some(expected_path) {
            *labels_guard = Some(labels);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// `project_path` と `milestones` を**両方の lock を順に同時保持した状態で** snapshot する。
    ///
    /// `create_milestone` / `update_milestone` が書き込み前に使う。`snapshot_label_write`
    /// と同型。lock 取得順序は AppState の契約に従って `project_path → milestones` を遵守する。
    pub fn snapshot_milestone_write(&self) -> Result<MilestoneWriteContext, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let milestones_guard = lock(&self.milestones)?;
        Ok(MilestoneWriteContext {
            project_root: path_guard.clone(),
            milestones: milestones_guard.clone(),
        })
    }

    /// `project_path` / `milestones` / `tasks_cache` を**3 つの lock を順に同時保持した
    /// 状態で** snapshot する。
    ///
    /// `delete_milestone` / `get_milestones` が使う。削除前 usageCount は milestones と
    /// tasks を整合した 1 回の観測から算出する必要がある。lock 取得順序は AppState の契約に
    /// 従って `project_path → milestones → tasks_cache` を遵守する。
    pub fn snapshot_milestone_delete(&self) -> Result<MilestoneDeleteContext, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let milestones_guard = lock(&self.milestones)?;
        let tasks_guard = lock(&self.tasks_cache)?;
        Ok(MilestoneDeleteContext {
            project_root: path_guard.clone(),
            milestones: milestones_guard.clone(),
            tasks: tasks_guard.values().cloned().collect(),
        })
    }

    /// 現在の `project_path` が `expected_path` と一致する場合のみ `milestones` を差し替える。
    ///
    /// `snapshot_milestone_write` / `snapshot_milestone_delete` で読んだ snapshot を mutate
    /// し disk write 成功後に書き戻す flow で、並行 `open_project` による project swap を
    /// 検出するための atomic check-and-set。lock 取得順序は `project_path → milestones`。
    ///
    /// - `expected_path` が一致 → `milestones` を更新して `Ok(true)`
    /// - 不一致（並行 `open_project` 等） → 何も変更せず `Ok(false)`
    pub fn replace_milestones_if_project_matches(
        &self,
        expected_path: &std::path::Path,
        milestones: MilestoneRegistry,
    ) -> Result<bool, AppStateError> {
        let path_guard = lock(&self.project_path)?;
        let mut milestones_guard = lock(&self.milestones)?;
        if path_guard.as_deref() == Some(expected_path) {
            *milestones_guard = Some(milestones);
            Ok(true)
        } else {
            Ok(false)
        }
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

    /// `tasks_cache` を不変で借りて closure 内で読み取る。
    ///
    /// `tasks_snapshot` は全 task を clone するため、1 件だけ引き当てたい用途では
    /// task 本文を含む無駄なコピーが発生する。本 API は lock 内で参照だけを渡し、
    /// 必要な 1 件だけを呼び出し側が clone できるようにする。
    ///
    /// closure は guard を保持したまま呼ばれるため、内部で AppState の他アクセサを
    /// 呼んではならない（自己 deadlock の原因）。
    pub fn with_tasks_cache<F, R>(&self, f: F) -> Result<R, AppStateError>
    where
        F: FnOnce(&HashMap<PathBuf, Task>) -> R,
    {
        let guard = lock(&self.tasks_cache)?;
        Ok(f(&guard))
    }

    /// 現在の `project_path` が `expected_path` と一致する場合のみ、`tasks_cache` の更新と
    /// `config` の差し替えを**同一クリティカルセクション内で**行う。
    ///
    /// `replace_config_if_project_matches` → `with_tasks_cache_mut` と 2 回に分けると、
    /// その間に `open_project` が完了して、旧プロジェクト由来の `Task` を新プロジェクトの
    /// cache へ挿入してしまう。両方を 1 つの lock 保持区間に入れることでこれを防ぐ。
    /// lock 取得順序は AppState の契約に従って `project_path → config → tasks_cache`
    /// を遵守する。
    ///
    /// `update_tasks` は失敗し得る（並行削除で対象が cache から消えている等）。**`config` の
    /// 差し替えは `update_tasks` が成功した場合のみ**行い、失敗時は cache も config も
    /// 呼び出し前の状態に保つ。順序を逆にすると「config だけ移動後・tasks は移動前」という
    /// 部分適用が in-memory に残る。
    ///
    /// - `expected_path` が一致 → `update_tasks` を適用し、成功時のみ `config` も更新して
    ///   `Some(Ok(R))`。`update_tasks` 失敗時は何も変更せず `Some(Err(E))`
    /// - 不一致（並行 `open_project` 等） → 何も変更せず `None`
    pub fn replace_config_and_tasks_if_project_matches<F, R, E>(
        &self,
        expected_path: &std::path::Path,
        config: crate::config::Config,
        update_tasks: F,
    ) -> Result<Option<Result<R, E>>, AppStateError>
    where
        F: FnOnce(&mut HashMap<PathBuf, Task>) -> Result<R, E>,
    {
        let path_guard = lock(&self.project_path)?;
        let mut config_guard = lock(&self.config)?;
        let mut tasks_guard = lock(&self.tasks_cache)?;
        if path_guard.as_deref() != Some(expected_path) {
            return Ok(None);
        }
        match update_tasks(&mut tasks_guard) {
            Ok(value) => {
                *config_guard = Some(config);
                Ok(Some(Ok(value)))
            }
            Err(err) => Ok(Some(Err(err))),
        }
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

    /// `labels` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `labels()` と異なりクローンを行わないため、pre-flight 用途で
    /// `LabelRegistry` のコピーコストを避けられる。
    pub fn check_labels_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.labels)?;
        Ok(())
    }

    /// `milestones` 用 `Mutex` の健全性をチェックする副作用なしの probe。
    ///
    /// `milestones()` と異なりクローンを行わないため、pre-flight 用途で
    /// `MilestoneRegistry` のコピーコストを避けられる。
    pub fn check_milestones_lock(&self) -> Result<(), AppStateError> {
        let _guard = lock(&self.milestones)?;
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

    /// AppState が保持する 6 つの `Mutex` フィールドすべての lock 健全性を
    /// 一括 probe する副作用なしの API。
    ///
    /// `WriteIgnoreRegistry` は AppState の `Mutex` ではなく内部に独自の
    /// `Mutex` を持つため対象外。caller が必要なら
    /// `state.write_ignore().is_empty()?` 等を組み合わせて確認する。
    pub fn check_all_locks(&self) -> Result<(), AppStateError> {
        self.check_project_path_lock()?;
        self.check_config_lock()?;
        self.check_labels_lock()?;
        self.check_milestones_lock()?;
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

#[cfg(test)]
mod state_label_tests;

#[cfg(test)]
mod state_milestone_tests;
