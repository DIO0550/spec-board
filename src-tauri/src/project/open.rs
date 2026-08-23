//! `open_project` Tauri command 本体。
//!
//! フロントエンドから渡されたプロジェクトディレクトリを検証し、
//! `.spec-board/config.json` の読み込み（不在ならタスクの status から生成して保存し、
//! 既存 config にタスクの未知 status があれば末尾カラムとして追加して保存する）、
//! `.md` 走査・パース、親子関係 / 逆引きインデックスの構築、`GUIDE.md` の
//! best-effort 書き出しを行ったうえで `AppState` を一括更新する。
//!
//! # 構成
//!
//! - `OpenProjectPayload` / `OpenProjectError`: FE へ返す値・エラー
//! - `open_project`: `#[tauri::command]` 薄層（thin layer）。`tauri::AppHandle`
//!   は本層で構築する `TauriWatcherFactory` のフィールドへ閉じ込め、effect 層
//!   へは漏出させない
//! - `open_project_impl`: 単体テストの境界となる effect 層本体
//!   （`tauri::AppHandle` を受け取らず、watcher の prepare / paused stage を
//!   `WatcherFactory` trait、背景再スキャンの予約を
//!   `ReactivationResyncScheduler` trait で注入することでテスト容易性を確保する）
//!
//! # プロジェクトセッションキャッシュ
//!
//! 別プロジェクトへ切り替えるとき、退避された `ProjectSession` は
//! `AppState` の background cache に保存される。同じ root を再び開くと disk 走査
//! なしでその session data を再利用し、SessionId だけ新規採番して再活性化する。
//! 即時応答の直後に `project::reactivation` の背景再スキャンを予約し、watcher
//! 停止中の disk 変更を `watcher-resync-required` 経由で反映させる。
//!
//! # エラー文字列の契約
//!
//! FE 側 (`TauriError.from`、`src/lib/tauri/tauriError/index.ts`) は以下の
//! 正規表現で先頭ヒットを採用してエラー種別を判定する。Display 文字列を変更
//! する際は FE 側のテストとの整合性を必ず確認すること。
//!
//! FE 側 `PATTERNS` 定義:
//!
//! | 順 | 正規表現 | `TauriErrorCode` |
//! |:-|:-|:-|
//! | 1 | `/見つかりません\|not found/i` | `NOT_FOUND` |
//! | 2 | `/アクセスできません\|permission/i` | `PERMISSION_DENIED` |
//! | 3 | `/\bio\b\|i\/o\|読み取り\|書き込み/i` | `IO_ERROR` |
//! | 4 | `/\bparse\b\|フロントマター/i` | `PARSE_ERROR` |
//!
//! BE `OpenProjectError` variant と FE 分類の代表例（**先頭ヒット**で決まる）:
//!
//! | OpenProjectError variant | Display 文字列の例 | FE 分類（代表例） |
//! |:-|:-|:-|
//! | `DirectoryNotFound` | `ディレクトリが見つかりません: ...` | `NOT_FOUND` |
//! | `PermissionDenied` | `ディレクトリにアクセスできません: ...` | `PERMISSION_DENIED` |
//! | `ScanFailed` | `io scan failed: ...` | `IO_ERROR` |
//! | `ConfigLoadFailed` (`category="io"`) | `config load failed (io): ...` | `IO_ERROR` |
//! | `ConfigLoadFailed` (`category="parse"`) | `config load failed (parse): ...` | `PARSE_ERROR` |
//! | `LabelsLoadFailed` (`category="io"`) | `labels load failed (io): ...` | `IO_ERROR` |
//! | `LabelsLoadFailed` (`category="parse"`) | `labels load failed (parse): ...` | `PARSE_ERROR` |
//! | `MilestonesLoadFailed` (`category="io"`) | `milestones load failed (io): ...` | `IO_ERROR` |
//! | `MilestonesLoadFailed` (`category="parse"`) | `milestones load failed (parse): ...` | `PARSE_ERROR` |
//! | `NotADirectory` | `ディレクトリではありません: ...` | `UNKNOWN`（FE 側 PATTERNS 未対応） |
//! | `StateLockPoisoned` | `内部状態のロックが破損しました` | `UNKNOWN`（FE 側 PATTERNS 未対応） |
//!
//! 注意: FE `TauriError.from` は `PATTERNS` 配列の **先頭ヒット**でコードを決める。
//! 例えば `ConfigLoadFailed (category="io")` の Display は `config load failed (io):
//! ...` だが、内側に OS から伝播した `Permission denied` 等の文字列が含まれる
//! 場合、表より優先度の高い `PERMISSION_DENIED` パターンに先にヒットして
//! `PERMISSION_DENIED` に分類される。`NotFound` 系も同様（`/見つかりません|not
//! found/i` が `\bio\b` より先にマッチする）。本表の分類は **代表例** であり、
//! 実際の分類は内側 source のメッセージにより揺れ得る点に注意。揺れを避ける場合は
//! BE 側で IO 系を `DirectoryNotFound` / `PermissionDenied` などの専用 variant
//! にあらかじめ詰め直すこと（`validate_directory` / `map_scan_error` で実施済み）。
//!
//! `NotADirectory` / `StateLockPoisoned` を FE で個別分類したい場合は、
//! FE 側 `PATTERNS` に「ディレクトリではありません」「内部状態のロック」等を
//! 追加すること。現状はこれら 2 variant は `UNKNOWN` 扱いとなる前提で
//! BE 側エラー Display を生成している。

use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use std::sync::Arc;

use crate::config::column_name::ColumnName;
use crate::config::{
    build_config_from_statuses, label_registry_store, load_persisted, milestone_registry_store,
    write_guide_markdown_best_effort, Column, Config, ConfigWriter, FsConfigWriter, LabelRegistry,
    LabelRegistryStore, LoadLabelsError, LoadMilestonesError, MilestoneRegistry,
    MilestoneRegistryStore,
};
use crate::project::load_warning::{deduplicate_and_sort, ProjectLoadWarning};
use crate::project::project_root::ProjectRoot;
#[cfg(test)]
use crate::project::reactivation::NoopReactivationScheduler;
use crate::project::reactivation::{ReactivationResyncScheduler, TauriReactivationResyncScheduler};
use crate::project::watcher_factory::{TauriWatcherFactory, WatcherFactory};
use crate::project::OpenProjectIntent;
use crate::project_session::{
    PreparedProjectSession, ProjectSession, ProjectSessionSnapshot, SessionIdExhausted,
    SessionIdentity,
};
use crate::state::active_project_resources::{
    LogWatcherStopDiagnosticReporter, WatcherStopDiagnosticReporter,
};
use crate::state::watcher_session::WatcherSession;
use crate::state::{AppState, AppStateError, OpenSwapError};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::{default_status_for, TaskParseError};
use crate::task::payload::TaskPayload;
use crate::task::projection::{MilestoneProjectionMap, TaskForest, TaskProjectionMap};
use crate::task::rebuild::{rebuild_tasks_from_disk_with_report, RebuildTasksError};
use crate::task::task_index::{Task, TaskIndex};
use spec_board_fs::config::config_io;
use spec_board_fs::task::file_scanner::ScanError;
use spec_board_fs::watcher::core::WatcherError;

/// `open_project` コマンドのペイロード。
///
/// `tasks` は board 表示順（カラム表示順 → カラム内 `cardOrder` → `id` 昇順）で、
/// `columns` は `Config::columns` の `order` 昇順で `name` を抜き出す。
/// 並び順の決定は `TaskIndex::sorted_by_board_order` に集約し、`get_tasks` と揃える。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectPayload {
    pub tasks: Vec<TaskPayload>,
    pub columns: Vec<ColumnName>,
    /// filePath -> projection。初期表示時点で FE が集計を持てるよう同梱する。
    pub projections: TaskProjectionMap,
    /// milestone 名ごとの進捗と、`tasks` と同じ順序の所属 task path。
    pub milestone_projections: MilestoneProjectionMap,
    /// 親子階層のネストツリー。`get_tasks` の `taskTree` と同形・同順序。
    /// 初回ロード直後にツリービューを開いても再取得が要らないよう同梱する。
    pub task_tree: TaskForest,
    /// project load 中に個別ファイルや config fallback で発生した warning。
    pub load_warnings: Vec<ProjectLoadWarning>,
    /// watcher event の検証基準。`tasks` と**同一トランザクション**で確定した
    /// 値であることが必須（そうでないと FE が復旧不能な split-brain に陥る）。
    pub session: WatcherSession,
}

/// `open_project` コマンドのエラー。
///
/// FE 側 `TauriError.from` の正規表現に整合する日本語メッセージを保持する。
#[derive(Debug, Error)]
pub enum OpenProjectError {
    /// 指定パスが存在しない / scan 段階で消失した。
    #[error("ディレクトリが見つかりません: {path}")]
    DirectoryNotFound { path: String },
    /// 指定パスがディレクトリではない（通常ファイル等）。
    #[error("ディレクトリではありません: {path}")]
    NotADirectory { path: String },
    /// 指定パスへのアクセス権限が無い。
    #[error("ディレクトリにアクセスできません: {path}")]
    PermissionDenied { path: String },
    /// `AppState` 内部 mutex / `WriteIgnoreRegistry` の lock が poison している。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// process内で一意なproject session IDをこれ以上採番できない。
    #[error(transparent)]
    SessionIdExhausted(#[from] SessionIdExhausted),
    /// candidate domainとstage済みresourcesのidentityが一致しない。
    #[error(
        "project session/resource identity mismatch: candidate={candidate:?}, staged={staged:?}"
    )]
    SessionIdentityMismatch {
        candidate: SessionIdentity,
        staged: SessionIdentity,
    },
    /// scan / parent chain の致命的失敗。Display に "io" を含めて FE 正規表現にマッチさせる。
    #[error("io scan failed: {message}")]
    ScanFailed { message: String },
    /// `config.json` の読み込みに失敗した。
    ///
    /// `category` は `"io"` または `"parse"` のいずれか。Display に埋め込んで
    /// FE 正規表現 (`\bio\b` / `\bparse\b`) にマッチさせる。
    #[error("config load failed ({category}): {message}")]
    ConfigLoadFailed {
        category: &'static str,
        message: String,
    },
    /// `.spec-board/labels.yml` の読み込みに失敗した。
    ///
    /// `category` は `"io"` または `"parse"`。`config load failed` と同じ Display 契約に
    /// 揃え、FE 正規表現（`\bio\b` / `\bparse\b`）にマッチさせる。
    #[error("labels load failed ({category}): {message}")]
    LabelsLoadFailed {
        category: &'static str,
        message: String,
    },
    /// `.spec-board/milestones.yml` の読み込みに失敗した。
    ///
    /// `category` は `"io"` または `"parse"`。`labels load failed` と同じ Display 契約に
    /// 揃え、FE 正規表現（`\bio\b` / `\bparse\b`）にマッチさせる。
    #[error("milestones load failed ({category}): {message}")]
    MilestonesLoadFailed {
        category: &'static str,
        message: String,
    },
    /// Watcher 初期化失敗（inotify 上限 / poll fallback 失敗 / path missing 等）。
    ///
    /// FE 側 `PATTERNS` には未対応のため `UNKNOWN` 分類になる。prepare / thread
    /// stage は `swap_open` より前に完了するため、失敗時は resident domain/resources
    /// を一切変更しない。
    #[error("ファイル監視の初期化に失敗しました: {source}")]
    WatcherInitFailed {
        #[from]
        source: WatcherError,
    },
}

impl From<AppStateError> for OpenProjectError {
    fn from(_: AppStateError) -> Self {
        OpenProjectError::StateLockPoisoned
    }
}

/// `swap_open` のtyped failureをopen command境界へexhaustiveに変換する。
fn map_open_swap_error(error: OpenSwapError) -> OpenProjectError {
    match error {
        OpenSwapError::DomainLockPoisoned | OpenSwapError::ResourceLockPoisoned => {
            OpenProjectError::StateLockPoisoned
        }
        OpenSwapError::IdentityMismatch { candidate, staged } => {
            OpenProjectError::SessionIdentityMismatch { candidate, staged }
        }
    }
}

/// Tauri command 薄層。`open_project_impl` を直接呼び、エラーを文字列化して返す。
///
/// `tauri::AppHandle` はこの薄層で構築する `TauriWatcherFactory` のフィールドに
/// 閉じ込めて effect 層へは漏出させない。empty path 拒否は `OpenProjectIntent`
/// 構築時 (`TryFrom<String>`) に集約済みのため、本層では `intent` 構築失敗時の
/// `DirectoryNotFound { path: "" }` を文字列化してそのまま返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `OpenProjectError` の Display 文字列であり、
/// FE 側でパターンマッチして `TauriError` に変換される。
#[tauri::command]
pub fn open_project(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<OpenProjectPayload, String> {
    let intent = OpenProjectIntent::try_from(path).map_err(|e| e.to_string())?;
    let resync = TauriReactivationResyncScheduler::new(app.clone(), Arc::clone(state.inner()));
    let watcher = TauriWatcherFactory::new(app);
    let stop_reporter = LogWatcherStopDiagnosticReporter;
    // ファクトリで既定の labels store（YAML 具象）を生成して注入する。
    // effect 層は `&dyn LabelRegistryStore` のみに依存し、具象型も YAML 形式も知らない。
    let labels_store = label_registry_store(intent.as_path());
    let milestones_store = milestone_registry_store(intent.as_path());
    open_project_impl_with_reporter(
        state.inner(),
        &intent,
        ProjectDataPorts {
            labels_store: &labels_store,
            milestones_store: &milestones_store,
            config_writer: &FsConfigWriter,
        },
        &watcher,
        &stop_reporter,
        &resync,
    )
    .map_err(|e| e.to_string())
}

/// コールドオープンが disk 上のプロジェクト資産へ触れるための注入口。
///
/// labels / milestones / config の 3 つは「同じ project root の disk を読み書きする
/// 手段」という一つの関心なので、個別の引数に展開せずまとめて渡す。
pub(crate) struct ProjectDataPorts<'a> {
    pub(crate) labels_store: &'a dyn LabelRegistryStore,
    pub(crate) milestones_store: &'a dyn MilestoneRegistryStore,
    pub(crate) config_writer: &'a dyn ConfigWriter,
}

/// 既存 test helper 向けの production reporter 付き effect wrapper。
///
/// 背景 resync の予約有無を検証しないテストのために scheduler は no-op を注入し、
/// config の書き込みは本番と同じ `FsConfigWriter` を使う。書き込み失敗を注入したい
/// テストは `open_project_impl_with_reporter` を直接呼ぶ。
#[cfg(test)]
pub(crate) fn open_project_impl<W: WatcherFactory>(
    state: &Arc<AppState>,
    intent: &OpenProjectIntent,
    labels_store: &dyn LabelRegistryStore,
    milestones_store: &dyn MilestoneRegistryStore,
    watcher: &W,
) -> Result<OpenProjectPayload, OpenProjectError> {
    open_project_impl_with_reporter(
        state,
        intent,
        ProjectDataPorts {
            labels_store,
            milestones_store,
            config_writer: &FsConfigWriter,
        },
        watcher,
        &LogWatcherStopDiagnosticReporter,
        &NoopReactivationScheduler,
    )
}

/// `open_project` の effect 層本体。
///
/// target exact-root gate を保持して load/prepare/stage/swap を直列化する。domain と
/// resources の置換後は gate を解放し、旧 watcher の停止を全 state lock 外で行う。
pub(crate) fn open_project_impl_with_reporter<W: WatcherFactory>(
    state: &Arc<AppState>,
    intent: &OpenProjectIntent,
    ports: ProjectDataPorts<'_>,
    watcher: &W,
    stop_reporter: &dyn WatcherStopDiagnosticReporter,
    resync: &dyn ReactivationResyncScheduler,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let root = intent.as_path();
    let raw_path = intent.as_path_str();
    validate_directory(root, raw_path)?;
    check_app_state_locks(state)?;

    let (swap, from_cache) = state.with_project_root_writer_lease(intent.root(), || {
        // キャッシュヒット時は disk 走査・parse・GUIDE 書き出しを一切行わず、保持して
        // いた session data を新しい identity で再活性化する。取り出したエントリは
        // 以降の失敗（watcher prepare / stage / swap）でも再 stash しない。
        let cached = take_cached_session(state, intent.root());
        let from_cache = cached.is_some();
        let (prepared_session, cold_config_origin) = match cached {
            Some(cached_session) => (cached_session.into_prepared(), None),
            None => {
                let (prepared, origin) = load_cold_prepared_session(intent, ports)?;
                (prepared, Some(origin))
            }
        };

        // backend/channel と paused worker の構築を resident state の変更前に完了する。
        let prepared_watcher = watcher.prepare(root)?;
        let session_id = state.reserve_session_id()?;
        let candidate = prepared_session.into_session(session_id);
        let staged = watcher.stage_paused(prepared_watcher, state, candidate.identity())?;

        if matches!(
            cold_config_origin,
            Some(ConfigOrigin::Persisted | ConfigOrigin::Absent)
        ) {
            write_guide_markdown_best_effort(root, candidate.config());
        }

        let swap = state
            .swap_open(candidate, staged)
            .map_err(map_open_swap_error)?;
        Ok::<_, OpenProjectError>((swap, from_cache))
    })??;

    // writer lease と全 state lock を解放してから旧 session/resources を処理する。
    if let Some(displaced_session) = swap.displaced_session {
        if let Err(error) = state.stash_background_session(displaced_session) {
            log::warn!("failed to stash displaced project session: {error}");
        }
    }
    if let Some(displaced) = swap.displaced_resources {
        displaced.stop_displaced_best_effort(stop_reporter);
    }
    if from_cache {
        resync.schedule(swap.snapshot.identity());
    }

    Ok(build_payload(swap.snapshot, swap.watcher_session))
}

/// background cache から再活性化できる session を取り出す。
///
/// cache は純粋な最適化なので、lock poison は open の失敗にせずコールドオープンへ
/// 落とす。ここで `?` すると一度 poison した時点で以後の open が恒久的に失敗する。
fn take_cached_session(state: &AppState, root: &ProjectRoot) -> Option<ProjectSession> {
    match state.take_background_session(root) {
        Ok(cached) => cached,
        Err(error) => {
            log::warn!("background session cache is unavailable; opening cold: {error}");
            None
        }
    }
}

/// キャッシュに無い project を disk から読み、open 用の材料へ詰める。
///
/// 呼び出し側が GUIDE.md の書き出し可否を判断できるよう、config の由来も返す。
fn load_cold_prepared_session(
    intent: &OpenProjectIntent,
    ports: ProjectDataPorts<'_>,
) -> Result<(PreparedProjectSession, ConfigOrigin), OpenProjectError> {
    let root = intent.as_path();
    let mut loaded = load_project_data(
        root,
        ports.labels_store,
        ports.milestones_store,
        &FsTaskIo,
        ports.config_writer,
    )
    .map_err(|error| map_load_project_data_error(error, intent.as_path_str()))?;

    if matches!(loaded.config_origin, ConfigOrigin::Absent) {
        match bootstrap_config(root, &mut loaded, ports.config_writer) {
            // 生成 config を前提に読み直す。走査は既定 config の `default_status` で
            // 行っており、status 未記載タスクにはその値が入っている。生成 config の
            // 既定 status が別のカラムになると、次回のコールドオープンでそれらの
            // タスクが別カラムへ移る。保存済み config で読み直して、以降のオープンと
            // 同じ状態に揃える。
            BootstrapOutcome::SavedWithNewDefaultStatus => {
                loaded = load_project_data(
                    root,
                    ports.labels_store,
                    ports.milestones_store,
                    &FsTaskIo,
                    ports.config_writer,
                )
                .map_err(|error| map_load_project_data_error(error, intent.as_path_str()))?;
            }
            BootstrapOutcome::Saved | BootstrapOutcome::NotSaved => {}
        }
    }

    let origin = loaded.config_origin;
    Ok((
        PreparedProjectSession::new_with_warnings(
            intent.root().clone(),
            loaded.config,
            loaded.labels,
            loaded.milestones,
            crate::task::task_index::ResolvedTaskSet::reresolve(loaded.tasks.into_values())
                .expect("loaded project tasks passed the canonical resolver"),
            loaded.load_warnings,
        ),
        origin,
    ))
}

/// config bootstrap の結果。呼び出し側がタスクの読み直しの要否を判断するために使う。
enum BootstrapOutcome {
    /// 生成した config を保存した。走査時と既定 status が同じなので読み直しは要らない。
    Saved,
    /// 生成した config を保存したが、既定 status（order 最小のカラム）が走査時と変わった。
    SavedWithNewDefaultStatus,
    /// 保存できなかった。既定 config のまま開き、warning を 1 件追加済み。
    NotSaved,
}

/// config 不在のコールドオープンで、生成した config を採用・保存する。
///
/// 保存できたときだけ生成結果を採用する。保存に失敗した状態で生成カラムを採用すると、
/// 次回オープンでまた既定カラムに戻り、並びが変わったように見えてしまうため。
fn bootstrap_config(
    root: &Path,
    loaded: &mut LoadedProjectData,
    writer: &dyn ConfigWriter,
) -> BootstrapOutcome {
    let generated = bootstrap_config_from_tasks(&loaded.tasks);
    match persist_config(root, &generated, writer) {
        Ok(()) => {
            let scanned_default = default_status_for(&loaded.config);
            let generated_default = default_status_for(&generated);
            // 既定 status が変わっても、その値を持つタスクが 1 件も無ければ読み直しても
            // 結果は変わらない。空プロジェクトや全タスクが status を書いている場合に
            // 無駄な全量再読込を避ける。
            let affects_tasks = loaded
                .tasks
                .values()
                .any(|task| task.status() == &scanned_default);
            loaded.config = generated;
            if generated_default != scanned_default && affects_tasks {
                return BootstrapOutcome::SavedWithNewDefaultStatus;
            }
            BootstrapOutcome::Saved
        }
        Err(error) => {
            log::warn!("failed to persist bootstrapped config: {error}");
            loaded
                .load_warnings
                .push(ProjectLoadWarning::config_fallback(error.to_string()));
            // `load_project_data` が整列済みの配列を返すため、push しただけでは
            // 末尾に 1 件ぶら下がって payload の順序規約が崩れる。
            loaded.load_warnings = deduplicate_and_sort(std::mem::take(&mut loaded.load_warnings));
            BootstrapOutcome::NotSaved
        }
    }
}

/// スキャン済みタスクの status から config を組み立てる。
///
/// タスクが 0 件のとき `build_config_from_statuses` は `columns: []` を返すが、
/// カラムのないボードは開けないため、この層で既定 3 カラムに倒す
/// （純粋関数側ではなく上位フローの責務という仕様上の切り分けに従う）。
///
/// `Task.status` は非 `Option` で、frontmatter に status が無いタスクはパース時に
/// `default_status`（config 不在時は `"Todo"`）へ補完済み。この値は
/// `build_config_from_statuses` が `None` に対して使うフォールバックと同じなので、
/// ここで `None` へ戻す必要はない。
fn bootstrap_config_from_tasks(tasks: &HashMap<CanonicalTaskPath, Task>) -> Config {
    if tasks.is_empty() {
        return Config::default();
    }

    build_config_from_statuses(&status_inputs_from_tasks(tasks))
}

/// スキャン済みタスクを [`build_config_from_statuses`] /
/// [`Config::plan_reconcile_columns`] が共有する `(path, status)` 列へ詰め替える。
///
/// `Task.status` は非 `Option` で、frontmatter に status が無いタスクはパース時に
/// 既定 status へ補完済みなので、ここで `None` へ戻す必要はない。
///
/// watcher の full rescan も同じ `HashMap<CanonicalTaskPath, Task>` を持つため `pub(crate)` で
/// 共有する（同型の helper を watcher 側に重複定義しないため）。
pub(crate) fn status_inputs_from_tasks(
    tasks: &HashMap<CanonicalTaskPath, Task>,
) -> Vec<(PathBuf, Option<String>)> {
    tasks
        .iter()
        .map(|(path, task)| (path.as_path_buf(), Some(task.status().as_str().to_owned())))
        .collect()
}

/// reconcile の結果。呼び出し側は config の採用と warning 追加だけを判断する。
pub(crate) enum ReconcileOutcome {
    /// 追加すべき未知 status が無く、config.json を書かなかった。
    Unchanged,
    /// 追加カラムを保存できた。呼び出し側はこの `Config` を採用する。
    Saved(Config),
    /// 追加カラムがあったが保存できなかった。呼び出し側は旧 config のまま続行し、
    /// この warning を 1 件積む。
    NotSaved(ProjectLoadWarning),
}

/// 既存 config へ未知 status のカラムを追加し、差分があるときだけ保存する。
///
/// 保存できたときだけ結果を採用する。背景 resync と CAS 競合復旧が config.json を
/// disk から読み直すため、保存に失敗したまま in-memory の結果を採ると直後に
/// 巻き戻り、利用者には「一瞬カラムが出て消える」挙動に見えるため
/// （config 不在時の bootstrap と同じ方針）。
///
/// タスク走査は `default_status_for(config)`（`order` 最小カラム）で行われるが、
/// 本関数は `order` 最大 +1 に追加するので既定 status は動かない。よって bootstrap の
/// ような「保存後にタスクを読み直す」分岐は持たない。
fn reconcile_config(
    root: &Path,
    config: &Config,
    tasks: &HashMap<CanonicalTaskPath, Task>,
    writer: &dyn ConfigWriter,
) -> ReconcileOutcome {
    let plan = config.plan_reconcile_columns(&status_inputs_from_tasks(tasks));
    if plan.is_noop {
        return ReconcileOutcome::Unchanged;
    }
    match persist_config(root, &plan.new_config, writer) {
        Ok(()) => {
            // GUIDE.md は config.json を保存できた**直後**に書く。session commit の
            // 後ろへ回すと、commit が競合して retry へ抜けたときに GUIDE だけが
            // 永久に古いまま残る（次の試行では config が既に保存済みで reconcile が
            // no-op になり、書き直す機会が二度と来ない）。GUIDE は best-effort なので
            // commit の成否と紐づける理由が無い。
            write_guide_markdown_best_effort(root, &plan.new_config);
            ReconcileOutcome::Saved(plan.new_config)
        }
        Err(error) => {
            log::warn!("failed to persist reconciled config: {error}");
            ReconcileOutcome::NotSaved(ProjectLoadWarning::config_fallback(error.to_string()))
        }
    }
}

/// 生成した config を `.spec-board/config.json` へ書き出す。
///
/// serialize 失敗も io エラーとして扱う。呼び出し側は成否だけで分岐し、
/// 失敗理由は warning のメッセージへ載せる。
///
/// 不在判定（`load_persisted`）から本書き込みまでの間に **別プロセス**が
/// `config.json` を作った場合、rename がそれを置き換える。同一プロセス内の open は
/// writer gate で直列化されるため競合しない。この窓を塞ぐには `O_EXCL` での
/// 新規作成に切り替える必要があるが、それでは書き込み失敗を注入できる
/// [`ConfigWriter`] 経由の atomic write を使えず、失敗時に空ファイルが残る経路が
/// 増える。`update_columns` / `move_task` の config 書き込みも同じ粒度の競合を
/// 許容しているため、ここも揃える。
pub(crate) fn persist_config(
    root: &Path,
    config: &Config,
    writer: &dyn ConfigWriter,
) -> std::io::Result<()> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
    writer.write_atomic(&config_io::config_path(root), &content)
}

/// `.spec-board/config.json` をどう手に入れたか。生成・追記の可否を分ける。
///
/// 3 つの経路（そのまま読めた / 不在 / 壊れていて既定値へ倒した）で書き込み方針が
/// 異なるため、bool 1 本ではなく列挙で持つ。
///
/// バリアントがデータを持たないので `Copy` を derive する。`matches!` で判定した
/// 後に `LoadedProjectData` へそのまま詰め直せないと、フィールドが move されてしまう。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConfigOrigin {
    /// disk の config.json をそのまま読めた。reconcile の対象。
    Persisted,
    /// config.json が存在しなかった。bootstrap の対象で、reconcile はしない
    /// （直後に bootstrap が config 全体を生成して置き換えるため、ここで既定
    /// 3 カラム + 未知 status を書くと二重書き込みになる）。
    Absent,
    /// 読み込みに失敗して既定値へ倒した。reconcile も bootstrap もしない
    /// （ユーザーの既存ファイルを勝手に上書きしないため）。
    Fallback,
}

/// コールドオープンと reactivation resync が共有する disk 全量読込の結果。
pub(crate) struct LoadedProjectData {
    pub(crate) config: Config,
    pub(crate) labels: LabelRegistry,
    pub(crate) milestones: MilestoneRegistry,
    pub(crate) tasks: HashMap<CanonicalTaskPath, Task>,
    pub(crate) load_warnings: Vec<ProjectLoadWarning>,
    /// config をどこから得たか。コールドオープンの bootstrap 判定と GUIDE.md の
    /// 書き出し判定、本ローダ内の reconcile 判定がこれを見る。
    pub(crate) config_origin: ConfigOrigin,
}

/// 全量読込が中断した理由。config は fallback するため variant を持たない。
#[derive(Debug, Error)]
pub(crate) enum LoadProjectDataError {
    #[error(transparent)]
    Labels(#[from] LoadLabelsError),
    #[error(transparent)]
    Milestones(#[from] LoadMilestonesError),
    #[error(transparent)]
    Tasks(#[from] RebuildTasksError),
}

/// project root 配下の config / labels / milestones / tasks を 1 セットで読み込む。
///
/// 「reactivation resync 後の状態 = コールドオープンした場合の状態」という収束
/// 不変条件を守るため、読み込み規則は両経路でこの関数だけに置く。片方へ書き写すと
/// 二重管理になり、fallback や warning の扱いがすぐ食い違う。
///
/// 本関数は原則 disk へ書かないが、**未知 status のカラム追加（reconcile）だけは
/// 例外**として config.json を書く。コールドオープン / キャッシュヒット後の背景
/// resync / CAS 競合復旧のいずれもここを通るため、reconcile をここへ置けば
/// 「どの経路で開いてもタスクがカラムから消えない」を 1 実装で満たせる。書き込むのは
/// 追加すべきカラムが実際にあるときだけで、差分が無ければ従来どおり読み取りしか行わない。
pub(crate) fn load_project_data(
    root: &Path,
    labels_store: &dyn LabelRegistryStore,
    milestones_store: &dyn MilestoneRegistryStore,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
) -> Result<LoadedProjectData, LoadProjectDataError> {
    let (mut config, config_origin, mut load_warnings) = match load_persisted(root) {
        Ok(Some(config)) => (config, ConfigOrigin::Persisted, Vec::new()),
        // 不在時も default で走査する。走査に必要な `default_status` を決めるためだけの
        // 暫定値で、bootstrap がこの後で生成 config に差し替える。
        Ok(None) => (Config::default(), ConfigOrigin::Absent, Vec::new()),
        Err(error) => (
            Config::default(),
            ConfigOrigin::Fallback,
            vec![ProjectLoadWarning::config_fallback(error.to_string())],
        ),
    };
    let labels = labels_store.load()?;
    let milestones = milestones_store.load()?;
    let default_status = default_status_for(&config);
    let report = rebuild_tasks_from_disk_with_report(root, &default_status, io)?;
    load_warnings.extend(report.warnings);
    let tasks: HashMap<CanonicalTaskPath, Task> = report
        .tasks
        .into_iter()
        .map(|task| (CanonicalTaskPath::from_file_path(task.file_path()), task))
        .collect();

    if matches!(config_origin, ConfigOrigin::Persisted) {
        match reconcile_config(root, &config, &tasks, config_writer) {
            ReconcileOutcome::Unchanged => {}
            ReconcileOutcome::Saved(reconciled) => {
                config = reconciled;
            }
            ReconcileOutcome::NotSaved(warning) => {
                load_warnings.push(warning);
            }
        }
    }
    // reconcile の warning もここで初めて整列対象へ入る。push した順のまま返すと
    // payload の順序規約が崩れるため、整列は reconcile より後ろに置く。
    let load_warnings = deduplicate_and_sort(load_warnings);

    Ok(LoadedProjectData {
        config,
        labels,
        milestones,
        tasks,
        load_warnings,
        config_origin,
    })
}

/// 共有ローダの typed error を open command のエラー契約へ詰め直す。
fn map_load_project_data_error(error: LoadProjectDataError, raw_path: &str) -> OpenProjectError {
    match error {
        LoadProjectDataError::Labels(source) => map_load_labels_error(source),
        LoadProjectDataError::Milestones(source) => map_load_milestones_error(source),
        LoadProjectDataError::Tasks(source) => map_rebuild_error(source, raw_path),
    }
}

/// resident domain/resources の lock 健全性を probe する。
///
/// scan / parse / GUIDE 副作用を実行する前に呼び出すことで、lock poison が
/// 確定している場合に `.spec-board/GUIDE.md` の不要な書き出しや scan の無駄を
/// 避けつつ早期に `Err(StateLockPoisoned)` を返せる。
fn check_app_state_locks(state: &AppState) -> Result<(), OpenProjectError> {
    state.check_open_locks()?;
    Ok(())
}

/// ディレクトリ実在性とアクセス権限を検証する。
///
/// 1. `fs::metadata` で存在を確認し、`NotFound` → `DirectoryNotFound`、
///    `PermissionDenied` / その他 IO エラー → `PermissionDenied` として扱う。
/// 2. `metadata.is_dir()` が false なら `NotADirectory`。
/// 3. `fs::read_dir` で読み取り権限を確認する。`metadata` 取得時点と
///    `read_dir` の間で root がファイルへ置き換わる TOCTOU が起きうるため、
///    `NotADirectory` も `OpenProjectError::NotADirectory` として返す。
///    それ以外のエラーは `PermissionDenied` として扱う（Unix で 0o000 の
///    ディレクトリは `metadata` は通るが `read_dir` が失敗するため、ここで
///    弾かないと後続層が ConfigLoadFailed として混在エラーを返してしまう）。
///
/// エラー文字列に埋め込む `path` は引数の生文字列 (`raw_path`) をそのまま使い、
/// `Path::display` 由来の正規化を避ける。
fn validate_directory(root: &Path, raw_path: &str) -> Result<(), OpenProjectError> {
    let metadata = fs::metadata(root).map_err(|err| map_metadata_error(err, raw_path))?;
    if !metadata.is_dir() {
        return Err(OpenProjectError::NotADirectory {
            path: raw_path.to_string(),
        });
    }
    if let Err(err) = fs::read_dir(root) {
        return Err(match err.kind() {
            ErrorKind::NotFound => OpenProjectError::DirectoryNotFound {
                path: raw_path.to_string(),
            },
            ErrorKind::NotADirectory => OpenProjectError::NotADirectory {
                path: raw_path.to_string(),
            },
            _ => OpenProjectError::PermissionDenied {
                path: raw_path.to_string(),
            },
        });
    }
    Ok(())
}

fn map_metadata_error(err: std::io::Error, raw_path: &str) -> OpenProjectError {
    match err.kind() {
        ErrorKind::NotFound => OpenProjectError::DirectoryNotFound {
            path: raw_path.to_string(),
        },
        ErrorKind::NotADirectory => OpenProjectError::NotADirectory {
            path: raw_path.to_string(),
        },
        ErrorKind::PermissionDenied => OpenProjectError::PermissionDenied {
            path: raw_path.to_string(),
        },
        _ => OpenProjectError::PermissionDenied {
            path: raw_path.to_string(),
        },
    }
}

/// `RebuildTasksError` を `OpenProjectError` に詰め直す。
fn map_rebuild_error(err: RebuildTasksError, raw_path: &str) -> OpenProjectError {
    match err {
        RebuildTasksError::Scan(source) => map_scan_error(source, raw_path),
        RebuildTasksError::Hierarchy(source) => map_hierarchy_error(source),
    }
}

/// `ScanError` を `OpenProjectError` に詰め直す。
///
/// `validate_directory` 後 / scan 開始までに root が変化する TOCTOU を
/// 想定し、`ErrorKind::NotFound` は `DirectoryNotFound`、`NotADirectory` は
/// `NotADirectory`、`PermissionDenied` は `PermissionDenied` にマップする。
/// それ以外は "io scan failed: ..." 形式の `ScanFailed` にする。`ScanFailed.message`
/// には `ScanError::Io` の Display（"failed to scan directory `{path}`: {source}"）
/// をそのまま埋め込み、どのディレクトリで scan が失敗したかをデバッグ情報として残す。
fn map_scan_error(err: ScanError, raw_path: &str) -> OpenProjectError {
    let kind = match &err {
        ScanError::Io { source, .. } => source.kind(),
    };
    match kind {
        ErrorKind::NotFound => OpenProjectError::DirectoryNotFound {
            path: raw_path.to_string(),
        },
        ErrorKind::NotADirectory => OpenProjectError::NotADirectory {
            path: raw_path.to_string(),
        },
        ErrorKind::PermissionDenied => OpenProjectError::PermissionDenied {
            path: raw_path.to_string(),
        },
        _ => OpenProjectError::ScanFailed {
            message: err.to_string(),
        },
    }
}

/// `LoadLabelsError` を `category` 付きの `LabelsLoadFailed` に分類する。
///
/// - `Io` → `category: "io"`
/// - `Parse`（YAML 構文）/ `Validation`（name 空・重複のマスタ整合性違反）→ `category: "parse"`
fn map_load_labels_error(err: LoadLabelsError) -> OpenProjectError {
    let category = match &err {
        LoadLabelsError::Io(_) => "io",
        LoadLabelsError::Parse { .. } | LoadLabelsError::Validation(_) => "parse",
    };
    OpenProjectError::LabelsLoadFailed {
        category,
        message: err.to_string(),
    }
}

/// `LoadMilestonesError` を `category` 付きの `MilestonesLoadFailed` に分類する。
///
/// - `Io` → `category: "io"`
/// - `Parse`（YAML 構文）/ `Validation`（name 空・重複のマスタ整合性違反）→ `category: "parse"`
fn map_load_milestones_error(err: LoadMilestonesError) -> OpenProjectError {
    let category = match &err {
        LoadMilestonesError::Io(_) => "io",
        LoadMilestonesError::Parse { .. } | LoadMilestonesError::Validation(_) => "parse",
    };
    OpenProjectError::MilestonesLoadFailed {
        category,
        message: err.to_string(),
    }
}

/// `TaskParseError` を `ScanFailed` に詰め直す。
///
/// lenient rebuild は循環をwarningへ倒すため、ここへ届くhierarchy errorは
/// `CycleOrTooDeep` のうち `TooDeep` だけである。
/// `ScanFailed` の Display は `"io scan failed: {message}"` なので、ここで
/// 改めて "io" を埋め込むと最終文字列が "io scan failed: io ..." と二重に
/// なるため、`err.to_string()` をそのまま埋め込む。FE 正規表現 `\bio\b` は
/// wrapper 側で満たされる。
fn map_hierarchy_error(err: TaskParseError) -> OpenProjectError {
    OpenProjectError::ScanFailed {
        message: err.to_string(),
    }
}

/// FE へ返す `OpenProjectPayload` を組み立てる。
///
/// `columns` は `Config::columns` の `order` 昇順 sort 後に `name` を抽出する。
///
/// `tasks` は「カラムの表示順 → そのカラムの保存済み `cardOrder` の並び → `id` 昇順」で
/// sort する。FE はカラムごとに `tasks` を filter して表示順に使うため、この並べ替えが
/// 「再オープンしても DnD で決めた並びが復元される」ための rehydration になる。
/// `cardOrder` に載っていないタスク（新規追加された md 等）は、そのカラムの末尾へ
/// `id` 昇順で並ぶ（`cardOrder` の「記載されていないタスクは末尾に追加」ルール）。
/// `columns` のいずれにも一致しない `status` のタスクは全カラムの後ろへ回す。
fn build_payload(snapshot: ProjectSessionSnapshot, session: WatcherSession) -> OpenProjectPayload {
    let tasks = snapshot.tasks().values().cloned().collect();
    let load_warnings = snapshot.load_warnings().to_vec();
    build_payload_from_parts_with_warnings(tasks, snapshot.config(), load_warnings, session)
}

#[cfg(test)]
fn build_payload_from_parts(
    tasks: Vec<Task>,
    config: &Config,
    session: WatcherSession,
) -> OpenProjectPayload {
    build_payload_from_parts_with_warnings(tasks, config, Vec::new(), session)
}

fn build_payload_from_parts_with_warnings(
    tasks: Vec<Task>,
    config: &Config,
    load_warnings: Vec<ProjectLoadWarning>,
    session: WatcherSession,
) -> OpenProjectPayload {
    // 並び順と projection 群の導出は aggregate の単一入口に委譲する
    // （`get_tasks` も同じ関数を通す。ここに手順をコピーしないこと）。
    let view = TaskIndex::project_board_view(tasks, config);

    let mut sorted_columns: Vec<&Column> = config.columns.iter().collect();
    sorted_columns.sort_by_key(|column| column.order);
    let columns = sorted_columns
        .into_iter()
        .map(|column| column.name.clone())
        .collect();
    OpenProjectPayload {
        tasks: view.tasks.into_iter().map(TaskPayload::from).collect(),
        columns,
        projections: view.projections,
        milestone_projections: view.milestone_projections,
        task_tree: view.task_tree,
        load_warnings,
        session,
    }
}

#[cfg(test)]
#[path = "open_tests.rs"]
mod open_tests;
