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
//! - `open_project`: `#[tauri::command]` シン
//! - `open_project_impl`: 単体テストの境界となる本体関数
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
//! 追加すること。本 Issue 範囲ではこれら 2 variant は `UNKNOWN` 扱いとなる前提で
//! BE 側エラー Display を生成している。

use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use std::sync::Arc;

use crate::config::value_objects::column_name::ColumnName;
use crate::config::{
    load_or_default, write_guide_markdown_best_effort, Column, Config, LoadConfigError,
};
use crate::project::value_objects::project_root::ProjectRoot;
use crate::state::{AppState, AppStateError, BoxedWatcherHandle};
use crate::task::index::{
    build_children, build_reverse_links, default_status_for, task_from_markdown, Task,
    TaskParseContext, TaskParseError,
};
use spec_board_fs::task::file_scanner::{scan_md_files, ScanError};
use spec_board_fs::watcher::core::WatcherError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

/// `open_project` コマンドのペイロード。
///
/// `tasks` は `id` 昇順、`columns` は `Config::columns` の `order` 昇順で `name` を抜き出す。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectPayload {
    pub tasks: Vec<Task>,
    pub columns: Vec<ColumnName>,
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
    /// Watcher 初期化失敗（inotify 上限 / poll fallback 失敗 / path missing 等）。
    ///
    /// FE 側 `PATTERNS` には未対応のため `UNKNOWN` 分類になる。失敗時は
    /// `commit_app_state` の (1) 段階で復帰し、`AppState` の全フィールドが
    /// 一切変更されない契約。
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

impl From<WriteIgnoreError> for OpenProjectError {
    /// `WriteIgnoreError` を意味別に詰め直す。
    ///
    /// - `LockPoisoned` のみ `StateLockPoisoned` として「内部状態のロック破損」
    ///   と扱う
    /// - `CleanupWorkerSpawnFailed` 等の非 poison 系（現実装では返らないが将来
    ///   返り得る variant）は `ScanFailed` として io 系の致命扱いにし、
    ///   利用者へ「ロック破損」と誤通知しない
    fn from(err: WriteIgnoreError) -> Self {
        match err {
            WriteIgnoreError::LockPoisoned => OpenProjectError::StateLockPoisoned,
            other => OpenProjectError::ScanFailed {
                message: other.to_string(),
            },
        }
    }
}

/// Tauri command 薄層。`open_project_impl` を呼び、エラーを文字列化して返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `OpenProjectError` の Display 文字列であり、
/// FE 側でパターンマッチして `TauriError` に変換される。
#[tauri::command]
pub fn open_project(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<OpenProjectPayload, String> {
    // FE から渡された path を最初に ProjectRoot VO へ詰め直し、空文字を境界で
    // 弾く。実在性チェックは `validate_directory` の責務。
    let root = ProjectRoot::try_from_str(&path)
        .map_err(|_| OpenProjectError::DirectoryNotFound { path: path.clone() }.to_string())?;
    open_project_impl(&app, state.inner().clone(), &root).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// 設計方針: ロード / パース / インデックス構築は AppState を一切触らずに行い、
/// 全工程が成功した時点でのみ `commit_app_state` で旧 state を置き換える。
/// 途中でエラーが返った場合は旧プロジェクトの state がそのまま保持される
/// （FE 側の「open 失敗時に元プロジェクトを復元する」UX 契約と一致させる）。
///
/// AppState の lock 健全性は scan / parse / GUIDE 副作用が走る前に
/// `check_app_state_locks` で一括 probe する。lock poison が確定している場合は
/// `.spec-board/GUIDE.md` の不要な書き出しや scan / parse の無駄を最初から避ける。
pub(crate) fn open_project_impl(
    app: &tauri::AppHandle,
    state: Arc<AppState>,
    root: &ProjectRoot,
) -> Result<OpenProjectPayload, OpenProjectError> {
    open_project_with_factories(
        state,
        root.as_path()
            .to_str()
            .ok_or_else(|| OpenProjectError::DirectoryNotFound {
                path: root.to_string(),
            })?,
        |root| {
            crate::watcher_event::prepare_watcher(root)
                .map_err(|source| OpenProjectError::WatcherInitFailed { source })
        },
        |(watcher, rx), state, root, config| {
            let handle = crate::watcher_event::spawn_adapter(
                app,
                root,
                config,
                Arc::clone(state),
                watcher,
                rx,
            );
            Box::new(handle) as BoxedWatcherHandle
        },
    )
}

/// `open_project_impl` のテスト容易性のための一般化版。
///
/// `prepare` / `spawn` を closure で注入することで、`AppHandle` を持たない
/// テストでも実装本体を直接駆動できる。
pub(crate) fn open_project_with_factories<P, S, T>(
    state: Arc<AppState>,
    path: &str,
    prepare: P,
    spawn: S,
) -> Result<OpenProjectPayload, OpenProjectError>
where
    P: FnOnce(&Path) -> Result<T, OpenProjectError>,
    S: FnOnce(T, &Arc<AppState>, &Path, &Config) -> BoxedWatcherHandle,
{
    let root = Path::new(path);
    validate_directory(root, path)?;
    check_app_state_locks(&state)?;

    let config = load_or_default(root).map_err(map_load_config_error)?;

    let md_paths = scan_md_files(root).map_err(|e| map_scan_error(e, path))?;

    let default_status = default_status_for(&config);
    let tasks = collect_tasks(root, &md_paths, &default_status);

    let tasks = build_children(tasks).map_err(map_hierarchy_error)?;
    let tasks = build_reverse_links(tasks);

    // GUIDE.md 書き込みより **前に** prepare を実行する。watcher 初期化失敗で
    // 復帰する場合に新 dir 配下の `.spec-board/GUIDE.md` が副作用として残らない
    // ようにするため。prepare 自体は AppState を一切更新しない。
    let prepared = prepare(root)?;

    write_guide_markdown_best_effort(root, &config);

    commit_app_state_with_prepared(&state, root, &config, &tasks, prepared, spawn)?;

    Ok(build_payload(tasks, &config))
}

/// AppState 4 mutex + WriteIgnoreRegistry の lock 健全性を一括 probe する。
///
/// scan / parse / GUIDE 副作用を実行する前に呼び出すことで、lock poison が
/// 確定している場合に `.spec-board/GUIDE.md` の不要な書き出しや scan の無駄を
/// 避けつつ早期に `Err(StateLockPoisoned)` を返せる。
///
/// `commit_app_state` でも最終的に同じ probe を実行するが、これは TOCTOU 的に
/// pre-flight 後 / commit 前に他スレッドで poison が発生する稀なケースを
/// 検出するためのもの。
fn check_app_state_locks(state: &AppState) -> Result<(), OpenProjectError> {
    state.check_all_locks()?;
    state.write_ignore().is_empty()?;
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

/// 走査結果の `.md` ファイル群から `Task` を集める。
///
/// 各 md ファイルの `fs::read` 失敗、`task_from_markdown` 失敗はいずれも
/// `log::warn!` を出して skip する（コマンド全体は成功させる）。
fn collect_tasks(root: &Path, md_paths: &[PathBuf], default_status: &ColumnName) -> Vec<Task> {
    let mut tasks = Vec::with_capacity(md_paths.len());
    for rel_path in md_paths {
        let absolute = root.join(rel_path);
        let bytes = match fs::read(&absolute) {
            Ok(bytes) => bytes,
            Err(err) => {
                log::warn!("failed to read task file `{}`: {err}", absolute.display());
                continue;
            }
        };
        let context = TaskParseContext {
            file_path: rel_path.clone(),
            default_status: default_status.clone(),
        };
        match task_from_markdown(&bytes, &context) {
            Ok(task) => tasks.push(task),
            Err(err) => {
                log::warn!("failed to parse task file `{}`: {err}", absolute.display());
            }
        }
    }
    tasks
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

/// `AppState` に新値を確定させる。
///
/// # ロック健全性の早期検出（pre-flight の限界）
///
/// 5 つの lock を独立して順次取得するため、**真の atomic な commit ではない**。
/// commit 冒頭で実行する pre-flight は「commit 開始時点で既に poison している
/// mutex を早期検出して副作用前に Err 復帰させる」ためのものであり、
/// pre-flight 後 / 個別 setter 呼び出し中に他スレッドの panic 等で後続 lock が
/// poison するケースまでは防げない（その場合は途中までの setter が成功した
/// 状態で Err が返る = 部分更新が残り得る）。
///
/// 真に atomic な commit が必要になった時点で、AppState 側に lock 取得順序に従って
/// 全フィールドを単一クリティカルセクションで更新する API を追加し、
/// ここから呼び替える設計に切り替える前提とする。本 Issue 範囲では Tauri command
/// が単一スレッドで直列処理されることを前提に pre-flight ベースの「best-effort 防御」
/// に留める。
///
/// `open_project_impl` 冒頭の `check_app_state_locks` でも同じ probe を行うが、
/// これは scan / parse / GUIDE 副作用の前に poison を検出して無駄な計算を
/// 避けるためであり、commit 直前の probe は pre-flight 後 / commit 前に
/// 他スレッドで poison が発生する稀なケースの取り逃しを減らすための念押し。
///
/// 1. **pre-flight**: `project_path` / `config` / `tasks_cache` /
///    `watcher_handle` / `write_ignore` の各 lock を順に probe し、
///    開始時点で既に poison していれば早期に `Err(StateLockPoisoned)` を返す。
///    この時点ではまだ何も書き換えていないため、`open_project_impl` の
///    「失敗時は旧プロジェクト state を保持する」契約が守られる。
/// 2. **書き込み**: 副作用を以下の順で実行する。
///    - `set_project_path` / `replace_config` / `replace_tasks_cache`: 値の swap のみ
///    - `write_ignore().clear()`: 旧プロジェクトの登録パスを破棄
///    - `install_watcher_handle`: 旧 watcher の `stop()` 呼び出しを最後に行う
///      （panic はここで発生し得るが、ほかの全てのフィールドは既に新値で確定済み）
///
/// AppState の各 setter は単一フィールドのみを操作し、guard を保持したまま他の
/// setter を呼ばないため、AppState の lock 取得順序ルール
/// （複数 guard 同時保持時の AB-BA 防止）には抵触しない。
///
/// `tasks_cache` の key は `PathBuf::from(task.file_path)`（`task.file_path` は
/// 既に root 相対の正規化済み文字列）。
/// `open_project` の commit 段階の一般化版。
///
/// `prepare` の実行と GUIDE.md 書き込みは呼び出し側
/// （`open_project_with_factories`）で順序を制御するため、本関数には
/// **既に確保済みの `prepared`** を直接渡す。これにより watcher 起動失敗時に
/// `.spec-board/GUIDE.md` を新 dir に書き込んでしまう副作用を避けられる。
///
/// 残りの手順は仕様どおり:
///
/// 1. 旧 watcher を `take_watcher_handle` で取り出して `stop()`（新 cache が
///    書かれる前に旧 watcher を必ず停止して race を防ぐ）
/// 2. project_path / config / tasks_cache / write_ignore.clear の commit を
///    1 ステップずつ実行
/// 3. `spawn(prepared, state, root, config)` で adapter スレッドを起動し、
///    返り値を `install_watcher_handle` で AppState に格納する。spawn は panic
///    以外で失敗しない契約。
pub(crate) fn commit_app_state_with_prepared<S, T>(
    state: &Arc<AppState>,
    root: &Path,
    config: &Config,
    tasks: &[Task],
    prepared: T,
    spawn: S,
) -> Result<(), OpenProjectError>
where
    S: FnOnce(T, &Arc<AppState>, &Path, &Config) -> BoxedWatcherHandle,
{
    state.check_all_locks()?;
    state.write_ignore().is_empty()?;

    if let Some(mut prev) = state.take_watcher_handle()? {
        prev.stop();
    }

    let mut cache = HashMap::with_capacity(tasks.len());
    for task in tasks {
        cache.insert(PathBuf::from(task.file_path.as_str()), task.clone());
    }

    state.set_project_path(Some(root.to_path_buf()))?;
    state.replace_config(Some(config.clone()))?;
    state.replace_tasks_cache(cache)?;
    state.write_ignore().clear()?;

    let handle = spawn(prepared, state, root, config);
    state.install_watcher_handle(handle)?;
    Ok(())
}

/// FE へ返す `OpenProjectPayload` を組み立てる。
///
/// `tasks` は `id` 昇順 sort、`columns` は `Config::columns` の `order` 昇順 sort 後に
/// `name` を抽出する。
fn build_payload(mut tasks: Vec<Task>, config: &Config) -> OpenProjectPayload {
    tasks.sort_by(|a, b| a.id.cmp(&b.id));
    let mut sorted_columns: Vec<&Column> = config.columns.iter().collect();
    sorted_columns.sort_by_key(|column| column.order);
    let columns = sorted_columns
        .into_iter()
        .map(|column| column.name.clone())
        .collect();
    OpenProjectPayload { tasks, columns }
}

#[cfg(test)]
#[path = "open_tests.rs"]
mod open_tests;
