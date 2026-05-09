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
//! FE 側 (`TauriError.from`) は以下の正規表現でエラー種別を判定する。
//! Display 文字列を変更する際は FE 側のテストとの整合性を必ず確認すること。
//!
//! - "見つかりません" → DirectoryNotFound
//! - "アクセスできません" → PermissionDenied
//! - `\bio\b` → ScanFailed / ConfigLoadFailed(io)
//! - `\bparse\b` → ConfigLoadFailed(parse)

use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;
use thiserror::Error;

use crate::config::{
    load_or_default, write_guide_markdown_best_effort, Column, Config, LoadConfigError,
};
use crate::state::{AppState, AppStateError};
use crate::task_index::{
    build_children, build_reverse_links, task_from_markdown, Task, TaskParseContext, TaskParseError,
};
use spec_board_fs::file_scanner::{scan_md_files, ScanError};
use spec_board_fs::watcher_handle::NoopWatcherHandle;
use spec_board_fs::write_ignore::WriteIgnoreError;

/// `open_project` コマンドのペイロード。
///
/// `tasks` は `id` 昇順、`columns` は `Config::columns` の `order` 昇順で `name` を抜き出す。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectPayload {
    pub tasks: Vec<Task>,
    pub columns: Vec<String>,
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
}

impl From<AppStateError> for OpenProjectError {
    fn from(_: AppStateError) -> Self {
        OpenProjectError::StateLockPoisoned
    }
}

impl From<WriteIgnoreError> for OpenProjectError {
    fn from(_: WriteIgnoreError) -> Self {
        OpenProjectError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`open_project_impl` を呼び、エラーを文字列化して返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `OpenProjectError` の Display 文字列であり、
/// FE 側でパターンマッチして `TauriError` に変換される。
#[tauri::command]
pub fn open_project(
    state: State<'_, AppState>,
    path: String,
) -> Result<OpenProjectPayload, String> {
    open_project_impl(state.inner(), &path).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// 設計方針: ロード / パース / インデックス構築は AppState を一切触らずに行い、
/// 全工程が成功した時点でのみ `commit_app_state` で旧 state を置き換える。
/// 途中でエラーが返った場合は旧プロジェクトの state がそのまま保持される
/// （FE 側の「open 失敗時に元プロジェクトを復元する」UX 契約と一致させる）。
pub(crate) fn open_project_impl(
    state: &AppState,
    path: &str,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let root = Path::new(path);
    validate_directory(root, path)?;

    let config = load_or_default(root).map_err(map_load_config_error)?;

    let md_paths = scan_md_files(root).map_err(|e| map_scan_error(e, path))?;

    let default_status = default_status_for(&config);
    let tasks = collect_tasks(root, &md_paths, &default_status);

    // build_children は内部で validate_parent_existence + validate_parent_hierarchy を
    // 順に呼ぶ。本層では明示呼び出しを行わず、致命的エラー (CycleOrTooDeep) のみを
    // ScanFailed に詰め直す。
    let tasks = build_children(tasks).map_err(map_hierarchy_error)?;
    let tasks = build_reverse_links(tasks);

    write_guide_markdown_best_effort(root, &config);

    commit_app_state(state, root, &config, &tasks)?;

    Ok(build_payload(tasks, &config))
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
fn collect_tasks(root: &Path, md_paths: &[PathBuf], default_status: &str) -> Vec<Task> {
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
            default_status: default_status.to_string(),
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

/// `default_status` を `config.columns` の `order` 昇順先頭の `name` から決定する。
/// `columns` が空の場合は空文字列を返す（`task_from_markdown` 側でも空文字 fallback を許容）。
fn default_status_for(config: &Config) -> String {
    config
        .columns
        .iter()
        .min_by_key(|column| column.order)
        .map(|column| column.name.clone())
        .unwrap_or_default()
}

/// `ScanError` を `OpenProjectError` に詰め直す。
///
/// `validate_directory` 後 / scan 開始までに root が変化する TOCTOU を
/// 想定し、`ErrorKind::NotFound` は `DirectoryNotFound`、`NotADirectory` は
/// `NotADirectory`、`PermissionDenied` は `PermissionDenied` にマップする。
/// それ以外は "io scan failed: ..." 形式の `ScanFailed` にする。
fn map_scan_error(err: ScanError, raw_path: &str) -> OpenProjectError {
    let ScanError::Io { source, .. } = err;
    match source.kind() {
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
            message: source.to_string(),
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
/// Display に "io" を含めて FE 正規表現にマッチさせる。
fn map_hierarchy_error(err: TaskParseError) -> OpenProjectError {
    OpenProjectError::ScanFailed {
        message: format!("io {err}"),
    }
}

/// `AppState` に新値を確定させる。
///
/// # 部分更新の防止
///
/// 5 つの lock を独立して順次取得するため真の atomic ではないが、
/// **pre-flight でロックの健全性を一括検証してから副作用を開始する**
/// ことで、lock poison による Err 復帰時に部分更新が残らないようにする。
///
/// 1. **pre-flight**: `project_path` / `config` / `tasks_cache` /
///    `watcher_handle` / `write_ignore` の各 lock を順に probe し、
///    poison していれば早期に `Err(StateLockPoisoned)` を返す。この時点では
///    まだ何も書き換えていないため、`open_project_impl` の「失敗時は旧プロジェクト
///    state を保持する」契約が守られる。
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
fn commit_app_state(
    state: &AppState,
    root: &Path,
    config: &Config,
    tasks: &[Task],
) -> Result<(), OpenProjectError> {
    // Pre-flight: AppState 4 mutex + WriteIgnoreRegistry の健全性を副作用なしで
    // 確認し、poison していれば副作用前に Err 復帰する。`tasks_snapshot()` などの
    // クローン系を probe に使うと既存タスク数に比例した clone が走ってしまうため、
    // no-op probe (`check_*_lock` / `is_empty`) を用いる。
    state.check_all_locks()?;
    state.write_ignore().is_empty()?;

    let mut cache = HashMap::with_capacity(tasks.len());
    for task in tasks {
        cache.insert(PathBuf::from(task.file_path.clone()), task.clone());
    }

    state.set_project_path(Some(root.to_path_buf()))?;
    state.replace_config(Some(config.clone()))?;
    state.replace_tasks_cache(cache)?;
    state.write_ignore().clear()?;
    state.install_watcher_handle(Box::new(NoopWatcherHandle::new()))?;
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
mod tests {
    use super::{open_project_impl, OpenProjectError, OpenProjectPayload};

    use crate::config::{CardOrder, Column, Config};
    use crate::state::AppState;
    use crate::task_index::Task;
    use spec_board_fs::watcher_handle::WatcherHandle;

    use std::fs;
    use std::path::Path;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use tempfile::TempDir;

    fn tempdir() -> TempDir {
        tempfile::tempdir().expect("create temp dir")
    }

    fn write_md(root: &Path, rel: &str, body: &str) {
        let absolute = root.join(rel);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(&absolute, body).expect("write md");
    }

    fn task_md(title: &str, status: &str, parent: Option<&str>) -> String {
        let mut s = String::from("---\n");
        s.push_str(&format!("title: {title}\n"));
        s.push_str(&format!("status: {status}\n"));
        if let Some(p) = parent {
            s.push_str(&format!("parent: {p}\n"));
        }
        s.push_str("---\n\nbody\n");
        s
    }

    fn write_config_json(root: &Path, content: &str) {
        let dir = root.join(".spec-board");
        fs::create_dir_all(&dir).expect("create .spec-board");
        fs::write(dir.join("config.json"), content).expect("write config.json");
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

    #[test]
    fn returns_directory_not_found_for_missing_path() {
        let state = AppState::new();
        // TempDir 配下に未作成のサブディレクトリを作って、確実に NotFound 入力を生成する。
        let dir = tempdir();
        let missing_path = dir.path().join("does-not-exist").join("project");
        let missing = missing_path.to_str().expect("utf-8 path");

        let err = open_project_impl(&state, missing).expect_err("missing path should fail");

        match err {
            OpenProjectError::DirectoryNotFound { ref path } => {
                assert_eq!(missing, path);
            }
            other => panic!("expected DirectoryNotFound, got {other:?}"),
        }
        let display = err.to_string();
        assert!(display.contains("ディレクトリが見つかりません"));
        assert!(display.contains(missing));
    }

    #[test]
    fn returns_not_a_directory_for_file_path() {
        let state = AppState::new();
        let dir = tempdir();
        let file_path = dir.path().join("regular.txt");
        fs::write(&file_path, "hello").expect("write file");
        let raw = file_path.to_str().expect("utf-8 path");

        let err = open_project_impl(&state, raw).expect_err("file path should fail");

        match err {
            OpenProjectError::NotADirectory { ref path } => assert_eq!(raw, path),
            other => panic!("expected NotADirectory, got {other:?}"),
        }
        assert!(err.to_string().contains("ディレクトリではありません"));
    }

    #[cfg(unix)]
    #[test]
    fn returns_permission_denied_for_inaccessible_directory() {
        use std::os::unix::fs::PermissionsExt;

        // root として実行されると 0o000 でもアクセスできてしまうため skip。
        if unsafe { libc_geteuid() } == 0 {
            return;
        }

        let state = AppState::new();
        let dir = tempdir();
        let target = dir.path().join("locked");
        fs::create_dir(&target).expect("create dir");
        let mut perms = fs::metadata(&target).expect("metadata").permissions();
        perms.set_mode(0o000);
        fs::set_permissions(&target, perms).expect("chmod");

        let raw = target.to_str().expect("utf-8 path").to_string();
        let err = open_project_impl(&state, &raw).expect_err("inaccessible dir should fail");

        // 権限を戻して TempDir のドロップを成功させる。
        let mut restore = fs::metadata(&target).expect("metadata").permissions();
        restore.set_mode(0o755);
        let _ = fs::set_permissions(&target, restore);

        match err {
            OpenProjectError::PermissionDenied { ref path } => {
                assert_eq!(&raw, path);
            }
            other => panic!("expected PermissionDenied, got {other:?}"),
        }
        assert!(err.to_string().contains("ディレクトリにアクセスできません"));
    }

    #[cfg(unix)]
    extern "C" {
        fn geteuid() -> u32;
    }

    #[cfg(unix)]
    unsafe fn libc_geteuid() -> u32 {
        geteuid()
    }

    #[test]
    fn empty_directory_returns_default_columns_and_no_tasks() {
        let state = AppState::new();
        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8 path").to_string();

        let payload = open_project_impl(&state, &raw).expect("empty dir should succeed");

        assert!(payload.tasks.is_empty());
        let default_columns: Vec<String> = Config::default()
            .columns
            .iter()
            .map(|c| c.name.clone())
            .collect();
        assert_eq!(default_columns, payload.columns);
    }

    #[test]
    fn tasks_are_sorted_by_id_and_children_are_built() {
        let state = AppState::new();
        let dir = tempdir();
        write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
        write_md(
            dir.path(),
            "tasks/a.md",
            &task_md("A", "Todo", Some("tasks/b.md")),
        );
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let payload = open_project_impl(&state, &raw).expect("should succeed");

        let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(vec!["tasks/a.md", "tasks/b.md"], ids);

        let task_b = payload
            .tasks
            .iter()
            .find(|t| t.id == "tasks/b.md")
            .expect("task b exists");
        assert_eq!(vec!["tasks/a.md".to_string()], task_b.children);
    }

    #[test]
    fn loads_user_config_when_available() {
        let state = AppState::new();
        let dir = tempdir();
        let config_json = r#"{
            "version": 1,
            "columns": [
                { "name": "Backlog", "order": 0 },
                { "name": "Doing",   "order": 1 },
                { "name": "Shipped", "order": 2 }
            ],
            "cardOrder": {}
        }"#;
        write_config_json(dir.path(), config_json);
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let payload = open_project_impl(&state, &raw).expect("should succeed");

        assert_eq!(
            vec![
                "Backlog".to_string(),
                "Doing".to_string(),
                "Shipped".to_string()
            ],
            payload.columns
        );
    }

    #[test]
    fn columns_sorted_by_order_irrespective_of_input_array_order() {
        let state = AppState::new();
        let dir = tempdir();
        let config_json = r#"{
            "version": 1,
            "columns": [
                { "name": "C", "order": 2 },
                { "name": "A", "order": 0 },
                { "name": "B", "order": 1 }
            ],
            "cardOrder": {}
        }"#;
        write_config_json(dir.path(), config_json);
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let payload = open_project_impl(&state, &raw).expect("should succeed");

        assert_eq!(
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            payload.columns
        );
    }

    #[test]
    fn writes_guide_markdown_to_disk() {
        let state = AppState::new();
        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8").to_string();

        open_project_impl(&state, &raw).expect("should succeed");

        let guide = dir.path().join(".spec-board").join("GUIDE.md");
        assert!(guide.exists(), "GUIDE.md should be created");
        let body = fs::read_to_string(&guide).expect("read GUIDE");
        assert!(body.contains("Todo"));
    }

    #[test]
    fn updates_app_state_fields_on_success() {
        let state = AppState::new();
        let dir = tempdir();
        write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
        let raw = dir.path().to_str().expect("utf-8").to_string();

        open_project_impl(&state, &raw).expect("should succeed");

        assert_eq!(
            Some(dir.path().to_path_buf()),
            state.project_path().expect("readable")
        );
        let cfg = state.config().expect("readable").expect("config set");
        assert_eq!(Config::default(), cfg);
        let snapshot = state.tasks_snapshot().expect("readable");
        assert_eq!(1, snapshot.len());
        assert_eq!("tasks/a.md", snapshot[0].file_path);
        let handle = state
            .take_watcher_handle()
            .expect("readable")
            .expect("watcher installed");
        drop(handle);
    }

    #[test]
    fn config_load_failure_for_invalid_json_returns_parse_category() {
        let state = AppState::new();
        let dir = tempdir();
        // 壊れた JSON
        write_config_json(dir.path(), "{ this is not json");
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let err = open_project_impl(&state, &raw).expect_err("invalid config should fail");

        match err {
            OpenProjectError::ConfigLoadFailed {
                category,
                ref message,
            } => {
                assert_eq!("parse", category);
                let display = err.to_string();
                assert!(display.contains("parse"), "display: {display}");
                assert!(!message.is_empty());
            }
            other => panic!("expected ConfigLoadFailed, got {other:?}"),
        }
    }

    #[test]
    fn config_load_failure_for_empty_columns_returns_parse_category() {
        let state = AppState::new();
        let dir = tempdir();
        let config_json = r#"{ "version": 1, "columns": [], "cardOrder": {} }"#;
        write_config_json(dir.path(), config_json);
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let err = open_project_impl(&state, &raw).expect_err("empty columns should fail");

        match err {
            OpenProjectError::ConfigLoadFailed { category, .. } => {
                assert_eq!("parse", category);
                assert!(err.to_string().contains("parse"));
            }
            other => panic!("expected ConfigLoadFailed, got {other:?}"),
        }
    }

    #[test]
    fn config_load_failure_when_spec_board_path_is_a_file_returns_io_category() {
        let state = AppState::new();
        let dir = tempdir();
        // .spec-board をファイルにしておく → config.json への読み込みが Io エラーになる。
        let spec_path = dir.path().join(".spec-board");
        fs::write(&spec_path, "not a directory").expect("write file at .spec-board");
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let err = open_project_impl(&state, &raw).expect_err(".spec-board as file should fail");

        match err {
            OpenProjectError::ConfigLoadFailed { category, .. } => {
                assert_eq!("io", category);
                assert!(err.to_string().contains("io"));
            }
            other => panic!("expected ConfigLoadFailed io, got {other:?}"),
        }
    }

    #[test]
    fn parent_cycle_returns_scan_failed_with_io_marker() {
        let state = AppState::new();
        let dir = tempdir();
        // a -> b -> a の循環
        write_md(
            dir.path(),
            "tasks/a.md",
            &task_md("A", "Todo", Some("tasks/b.md")),
        );
        write_md(
            dir.path(),
            "tasks/b.md",
            &task_md("B", "Todo", Some("tasks/a.md")),
        );
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let err = open_project_impl(&state, &raw).expect_err("cycle should fail");

        match err {
            OpenProjectError::ScanFailed { ref message } => {
                assert!(message.starts_with("io"), "message: {message}");
                assert!(err.to_string().contains("io"));
            }
            other => panic!("expected ScanFailed, got {other:?}"),
        }
    }

    #[test]
    fn corrupted_md_files_are_skipped_and_command_succeeds() {
        let state = AppState::new();
        let dir = tempdir();
        // 通常の md
        write_md(dir.path(), "tasks/ok.md", &task_md("OK", "Todo", None));
        // frontmatter のない md（task_from_markdown で NotTask）
        write_md(dir.path(), "tasks/nofm.md", "no frontmatter here\n");
        let raw = dir.path().to_str().expect("utf-8").to_string();

        let payload = open_project_impl(&state, &raw).expect("should succeed");

        let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(vec!["tasks/ok.md"], ids);
    }

    #[test]
    fn reopen_stops_previous_watcher_exactly_once() {
        let state = AppState::new();
        let counter = Arc::new(AtomicUsize::new(0));
        state
            .install_watcher_handle(Box::new(CountingHandle {
                stop_calls: Arc::clone(&counter),
            }))
            .expect("install old watcher");

        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8").to_string();

        open_project_impl(&state, &raw).expect("should succeed");

        assert_eq!(1, counter.load(Ordering::SeqCst));
    }

    #[test]
    fn reopen_clears_previous_write_ignore_paths() {
        let state = AppState::new();
        state
            .write_ignore()
            .register("tasks/dirty.md")
            .expect("register");
        assert!(!state.write_ignore().is_empty().expect("readable"));

        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8").to_string();

        open_project_impl(&state, &raw).expect("should succeed");

        assert!(state.write_ignore().is_empty().expect("readable"));
    }

    #[test]
    fn watcher_panic_propagates_and_subsequent_call_returns_state_lock_poisoned() {
        let state = Arc::new(AppState::new());
        state
            .install_watcher_handle(Box::new(PanickingHandle))
            .expect("install panicking watcher");

        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8").to_string();

        // 1 回目: 旧 watcher.stop() が panic するため open_project_impl 自体が panic を伝播。
        let panic_state = Arc::clone(&state);
        let panic_path = raw.clone();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            let _ = open_project_impl(panic_state.as_ref(), &panic_path);
        }));
        assert!(result.is_err(), "stop panic should propagate");

        // 2 回目以降: watcher_handle mutex が poison しているため StateLockPoisoned。
        let err = open_project_impl(state.as_ref(), &raw)
            .expect_err("subsequent call should report lock poisoned");

        match err {
            OpenProjectError::StateLockPoisoned => {}
            other => panic!("expected StateLockPoisoned, got {other:?}"),
        }
        assert_eq!("内部状態のロックが破損しました", err.to_string());
    }

    #[test]
    fn tasks_cache_uses_path_buf_keys_from_file_path() {
        let state = AppState::new();
        let dir = tempdir();
        write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
        write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
        let raw = dir.path().to_str().expect("utf-8").to_string();

        open_project_impl(&state, &raw).expect("should succeed");

        let snapshot = state.tasks_snapshot().expect("readable");
        let mut paths: Vec<String> = snapshot.iter().map(|t| t.file_path.clone()).collect();
        paths.sort();
        assert_eq!(
            vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
            paths
        );
    }

    #[test]
    fn commit_app_state_pre_flight_blocks_partial_updates_when_watcher_lock_poisoned() {
        // 旧 watcher を panic 経由で poison させる。
        let state = Arc::new(AppState::new());
        state
            .install_watcher_handle(Box::new(PanickingHandle))
            .expect("install panicking watcher");

        // 1 回目: watcher.stop() panic を伝播させて watcher_handle mutex を poison させる。
        let dir = tempdir();
        let raw = dir.path().to_str().expect("utf-8").to_string();
        let panic_state = Arc::clone(&state);
        let panic_path = raw.clone();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            let _ = open_project_impl(panic_state.as_ref(), &panic_path);
        }));
        assert!(result.is_err(), "stop panic should propagate");

        // 1 回目で書き込まれたフィールドのスナップショットを取る。
        let project_after_panic = state.project_path().expect("readable");
        let config_after_panic = state.config().expect("readable");

        // 2 回目: watcher_handle が poison しているので pre-flight が早期 Err を返し、
        // project_path / config / tasks_cache / write_ignore は一切書き換わらない。
        let other_dir = tempdir();
        let other_raw = other_dir.path().to_str().expect("utf-8").to_string();
        let err = open_project_impl(state.as_ref(), &other_raw)
            .expect_err("subsequent call should report lock poisoned");
        assert!(matches!(err, OpenProjectError::StateLockPoisoned));

        // pre-flight 失敗で副作用が走っていないことを確認する。
        assert_eq!(project_after_panic, state.project_path().expect("readable"));
        assert_eq!(config_after_panic, state.config().expect("readable"));
    }

    #[test]
    fn previous_app_state_is_preserved_when_load_fails() {
        // 1 回目の open で AppState を確定させる。
        let state = AppState::new();
        let first_dir = tempdir();
        write_md(first_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
        let first_raw = first_dir.path().to_str().expect("utf-8").to_string();
        open_project_impl(&state, &first_raw).expect("first open should succeed");

        let snapshot_before = state.tasks_snapshot().expect("readable");
        let project_before = state.project_path().expect("readable");

        // 2 回目の open は config 不正で失敗させる。
        let bad_dir = tempdir();
        write_config_json(bad_dir.path(), "{ this is not json");
        let bad_raw = bad_dir.path().to_str().expect("utf-8").to_string();
        let err = open_project_impl(&state, &bad_raw)
            .expect_err("second open with broken config should fail");
        assert!(matches!(err, OpenProjectError::ConfigLoadFailed { .. }));

        // 失敗時に前のプロジェクト state がそのまま残ることを担保する。
        let snapshot_after = state.tasks_snapshot().expect("readable");
        let project_after = state.project_path().expect("readable");
        assert_eq!(project_before, project_after);
        assert_eq!(snapshot_before.len(), snapshot_after.len());
        let file_paths_before: Vec<String> = snapshot_before
            .iter()
            .map(|t| t.file_path.clone())
            .collect();
        let file_paths_after: Vec<String> =
            snapshot_after.iter().map(|t| t.file_path.clone()).collect();
        assert_eq!(file_paths_before, file_paths_after);
    }

    #[test]
    fn payload_serialization_uses_camel_case() {
        let payload = OpenProjectPayload {
            tasks: Vec::new(),
            columns: vec!["Todo".into()],
        };
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"tasks\""));
        assert!(json.contains("\"columns\""));
    }

    #[test]
    fn build_payload_returns_empty_columns_for_config_with_no_columns() {
        let cfg = Config {
            version: 1,
            columns: Vec::new(),
            card_order: CardOrder::default(),
            done_column: None,
        };

        let payload = super::build_payload(Vec::new(), &cfg);

        assert!(payload.tasks.is_empty());
        assert!(payload.columns.is_empty());
    }

    #[test]
    fn build_payload_sorts_tasks_by_id_and_columns_by_order() {
        let cfg = Config {
            version: 1,
            columns: vec![
                Column {
                    name: "Z".into(),
                    order: 2,
                },
                Column {
                    name: "A".into(),
                    order: 0,
                },
                Column {
                    name: "M".into(),
                    order: 1,
                },
            ],
            card_order: CardOrder::default(),
            done_column: None,
        };
        let task_b = Task {
            id: "b.md".into(),
            file_path: "b.md".into(),
            title: "B".into(),
            status: "A".into(),
            priority: None,
            labels: Vec::new(),
            parent: None,
            links: Vec::new(),
            children: Vec::new(),
            reverse_links: Vec::new(),
            body: String::new(),
            extras: Default::default(),
            warnings: Vec::new(),
        };
        let task_a = Task {
            id: "a.md".into(),
            file_path: "a.md".into(),
            ..task_b.clone()
        };

        let payload = super::build_payload(vec![task_b, task_a], &cfg);

        let task_ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(vec!["a.md", "b.md"], task_ids);
        assert_eq!(
            vec!["A".to_string(), "M".to_string(), "Z".to_string()],
            payload.columns
        );
    }
}
