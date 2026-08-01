//! `open_project` Tauri command 本体。
//!
//! フロントエンドから渡されたプロジェクトディレクトリを検証し、
//! `.spec-board/config.json` の読み込み、`.md` 走査・パース、
//! 親子関係 / 逆引きインデックスの構築、`GUIDE.md` の best-effort 書き出しを
//! 行ったうえで `AppState` を一括更新する。
//!
//! # 構成
//!
//! - `OpenProjectPayload` / `OpenProjectError`: FE へ返す値・エラー
//! - `open_project`: `#[tauri::command]` 薄層（thin layer）。`tauri::AppHandle`
//!   は本層で構築する `TauriWatcherFactory` のフィールドへ閉じ込め、effect 層
//!   へは漏出させない
//! - `open_project_impl`: 単体テストの境界となる effect 層本体
//!   （`tauri::AppHandle` を受け取らず、watcher の prepare / paused stage を
//!   `WatcherFactory` trait で注入することでテスト容易性を確保する）
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

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use std::sync::Arc;

use crate::config::column_name::ColumnName;
use crate::config::{
    label_registry_store, load_or_default, milestone_registry_store,
    write_guide_markdown_best_effort, Column, Config, LabelRegistryStore, LoadConfigError,
    LoadLabelsError, LoadMilestonesError, MilestoneRegistryStore,
};
use crate::project::watcher_factory::{TauriWatcherFactory, WatcherFactory};
use crate::project::OpenProjectIntent;
use crate::project_session::{
    PreparedProjectSession, ProjectSessionSnapshot, SessionIdExhausted, SessionIdentity,
};
use crate::state::active_project_resources::{
    LogWatcherStopDiagnosticReporter, WatcherStopDiagnosticReporter,
};
use crate::state::watcher_session::WatcherSession;
use crate::state::{AppState, AppStateError, OpenSwapError};
use crate::task::io::FsTaskIo;
use crate::task::parse::{default_status_for, TaskParseError};
use crate::task::projection::{MilestoneProjectionMap, TaskProjectionMap};
use crate::task::rebuild::{rebuild_tasks_from_disk, RebuildTasksError};
use crate::task::task_index::{Task, TaskIndex};
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
    pub tasks: Vec<Task>,
    pub columns: Vec<ColumnName>,
    /// filePath -> projection。初期表示時点で FE が集計を持てるよう同梱する。
    pub projections: TaskProjectionMap,
    /// milestone 名ごとの進捗と、`tasks` と同じ順序の所属 task path。
    pub milestone_projections: MilestoneProjectionMap,
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
    let watcher = TauriWatcherFactory::new(app);
    let stop_reporter = LogWatcherStopDiagnosticReporter;
    // ファクトリで既定の labels store（YAML 具象）を生成して注入する。
    // effect 層は `&dyn LabelRegistryStore` のみに依存し、具象型も YAML 形式も知らない。
    let labels_store = label_registry_store(intent.as_path());
    let milestones_store = milestone_registry_store(intent.as_path());
    open_project_impl_with_reporter(
        state.inner(),
        &intent,
        &labels_store,
        &milestones_store,
        &watcher,
        &stop_reporter,
    )
    .map_err(|e| e.to_string())
}

/// 既存 test helper 向けの production reporter 付き effect wrapper。
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
        labels_store,
        milestones_store,
        watcher,
        &LogWatcherStopDiagnosticReporter,
    )
}

/// `open_project` の effect 層本体。
///
/// target exact-root gate を保持して load/prepare/stage/swap を直列化する。domain と
/// resources の置換後は gate を解放し、旧 watcher の停止を全 state lock 外で行う。
pub(crate) fn open_project_impl_with_reporter<W: WatcherFactory>(
    state: &Arc<AppState>,
    intent: &OpenProjectIntent,
    labels_store: &dyn LabelRegistryStore,
    milestones_store: &dyn MilestoneRegistryStore,
    watcher: &W,
    stop_reporter: &dyn WatcherStopDiagnosticReporter,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let root = intent.as_path();
    let raw_path = intent.as_path_str();
    validate_directory(root, raw_path)?;
    check_app_state_locks(state)?;

    let target_gate = state.writer_gate(intent.root())?;
    let open_guard = state.lock_writer_gate(target_gate.as_ref())?;

    let config = load_or_default(root).map_err(map_load_config_error)?;
    let labels = labels_store.load().map_err(map_load_labels_error)?;
    let milestones = milestones_store.load().map_err(map_load_milestones_error)?;
    let default_status = default_status_for(&config);
    let tasks = rebuild_tasks_from_disk(root, &default_status, &FsTaskIo)
        .map_err(|error| map_rebuild_error(error, raw_path))?;

    // backend/channel と paused worker の構築を resident state の変更前に完了する。
    let prepared_watcher = watcher.prepare(root)?;
    let task_cache = tasks
        .into_iter()
        .map(|task| (PathBuf::from(task.file_path.as_str()), task))
        .collect();
    let prepared_session = PreparedProjectSession::new(
        intent.root().clone(),
        config.clone(),
        labels,
        milestones,
        task_cache,
    );
    let session_id = state.reserve_session_id()?;
    let candidate = prepared_session.into_session(session_id);
    let staged = watcher.stage_paused(prepared_watcher, state, candidate.identity())?;

    write_guide_markdown_best_effort(root, &config);

    let swap = state
        .swap_open(candidate, staged)
        .map_err(map_open_swap_error)?;
    drop(open_guard);

    if let Some(displaced) = swap.displaced_resources {
        displaced.stop_displaced_best_effort(stop_reporter);
    }

    Ok(build_payload(swap.snapshot, swap.watcher_session))
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

/// `LoadConfigError` を `category` 付きの `ConfigLoadFailed` に分類する。
///
/// - `Io` / `BackupFailed` → `category: "io"`
/// - `Parse` / `UnknownFutureVersion` / `DuplicateColumnName` /
///   `EmptyColumns` / `MigrationFailed` → `category: "parse"`
fn map_load_config_error(err: LoadConfigError) -> OpenProjectError {
    let category = match &err {
        LoadConfigError::Io(_) | LoadConfigError::BackupFailed { .. } => "io",
        LoadConfigError::Parse { .. }
        | LoadConfigError::UnknownFutureVersion { .. }
        | LoadConfigError::DuplicateColumnName { .. }
        | LoadConfigError::EmptyColumns { .. }
        | LoadConfigError::MigrationFailed { .. } => "parse",
    };
    OpenProjectError::ConfigLoadFailed {
        category,
        message: err.to_string(),
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
/// `build_children` は `validate_parent_hierarchy` 経由で `CycleOrTooDeep` のみ
/// Err として返すため、本層では他 variant を考慮しなくてよい。
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
    build_payload_from_parts(tasks, snapshot.config(), session)
}

fn build_payload_from_parts(
    tasks: Vec<Task>,
    config: &Config,
    session: WatcherSession,
) -> OpenProjectPayload {
    // 並び順の契約は aggregate に集約する（`get_tasks` も同じ入口を通す）。
    let ordered_tasks = TaskIndex::new(tasks).sorted_by_board_order(config);
    // payload tasks と milestone の path 列を同じ ordered 集合から導出する。
    // `TaskIndex` へ move → `into_tasks()` で戻し、`Vec<Task>` の clone を避ける。
    let index = TaskIndex::new(ordered_tasks);
    let projections = index.project_all(config.resolved_done_column());
    let milestone_projections = index.project_milestones(config.resolved_done_column());
    let tasks = index.into_tasks();

    let mut sorted_columns: Vec<&Column> = config.columns.iter().collect();
    sorted_columns.sort_by_key(|column| column.order);
    let columns = sorted_columns
        .into_iter()
        .map(|column| column.name.clone())
        .collect();
    OpenProjectPayload {
        tasks,
        columns,
        projections,
        milestone_projections,
        session,
    }
}

#[cfg(test)]
#[path = "open_tests.rs"]
mod open_tests;
