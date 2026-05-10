use super::{open_project_with_factories, OpenProjectError, OpenProjectPayload};

use crate::config::{CardOrder, Column, Config};
use crate::state::{AppState, BoxedWatcherHandle};
use crate::task::index::Task;
use spec_board_fs::watcher::handle::{NoopWatcherHandle, WatcherHandle};

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use tempfile::TempDir;

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

/// 4 段階手順を保ったまま、`AppHandle` / `Watcher::start` を使わずに
/// `open_project_with_factories` を駆動するための shorthand。
fn open_with_noop(
    state: Arc<AppState>,
    path: &str,
) -> Result<OpenProjectPayload, OpenProjectError> {
    open_project_with_factories(
        state,
        path,
        |_root| Ok::<(), OpenProjectError>(()),
        |(), _state, _root, _config| Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
    )
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
    let state = Arc::new(AppState::new());
    // TempDir 配下に未作成のサブディレクトリを作って、確実に NotFound 入力を生成する。
    let dir = tempdir();
    let missing_path = dir.path().join("does-not-exist").join("project");
    let missing = missing_path.to_str().expect("utf-8 path");

    let err = open_with_noop(Arc::clone(&state), missing).expect_err("missing path should fail");

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
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let file_path = dir.path().join("regular.txt");
    fs::write(&file_path, "hello").expect("write file");
    let raw = file_path.to_str().expect("utf-8 path");

    let err = open_with_noop(Arc::clone(&state), raw).expect_err("file path should fail");

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

    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let target = dir.path().join("locked");
    fs::create_dir(&target).expect("create dir");
    let mut perms = fs::metadata(&target).expect("metadata").permissions();
    perms.set_mode(0o000);
    fs::set_permissions(&target, perms).expect("chmod");

    let raw = target.to_str().expect("utf-8 path").to_string();
    let err = open_with_noop(Arc::clone(&state), &raw).expect_err("inaccessible dir should fail");

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
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8 path").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("empty dir should succeed");

    assert!(payload.tasks.is_empty());
    let default_columns: Vec<String> = Config::default()
        .columns
        .iter()
        .map(|c| c.name.as_str().to_string())
        .collect();
    let payload_columns: Vec<String> = payload
        .columns
        .iter()
        .map(|c| c.as_str().to_string())
        .collect();
    assert_eq!(default_columns, payload_columns);
}

#[test]
fn tasks_are_sorted_by_id_and_children_are_built() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

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
    let state = Arc::new(AppState::new());
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

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

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
    let state = Arc::new(AppState::new());
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

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        vec!["A".to_string(), "B".to_string(), "C".to_string()],
        payload.columns
    );
}

#[test]
fn writes_guide_markdown_to_disk() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let guide = dir.path().join(".spec-board").join("GUIDE.md");
    assert!(guide.exists(), "GUIDE.md should be created");
    let body = fs::read_to_string(&guide).expect("read GUIDE");
    assert!(body.contains("Todo"));
}

#[test]
fn updates_app_state_fields_on_success() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

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
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // 壊れた JSON
    write_config_json(dir.path(), "{ this is not json");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err = open_with_noop(Arc::clone(&state), &raw).expect_err("invalid config should fail");

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
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{ "version": 1, "columns": [], "cardOrder": {} }"#;
    write_config_json(dir.path(), config_json);
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err = open_with_noop(Arc::clone(&state), &raw).expect_err("empty columns should fail");

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
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // .spec-board をファイルにしておく → config.json への読み込みが Io エラーになる。
    let spec_path = dir.path().join(".spec-board");
    fs::write(&spec_path, "not a directory").expect("write file at .spec-board");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err =
        open_with_noop(Arc::clone(&state), &raw).expect_err(".spec-board as file should fail");

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
    let state = Arc::new(AppState::new());
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

    let err = open_with_noop(Arc::clone(&state), &raw).expect_err("cycle should fail");

    match err {
        OpenProjectError::ScanFailed { ref message } => {
            // wrapper Display "io scan failed: ..." 側で \bio\b を満たすため、
            // message 内に "io" を二重に埋め込まない契約。最終 Display には
            // 必ず "io" が含まれることを担保する。
            assert!(!message.starts_with("io"), "message: {message}");
            let display = err.to_string();
            assert!(display.starts_with("io scan failed:"));
            assert!(display.contains("io"));
        }
        other => panic!("expected ScanFailed, got {other:?}"),
    }
}

#[test]
fn corrupted_md_files_are_skipped_and_command_succeeds() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // 通常の md
    write_md(dir.path(), "tasks/ok.md", &task_md("OK", "Todo", None));
    // frontmatter のない md（task_from_markdown で NotTask）
    write_md(dir.path(), "tasks/nofm.md", "no frontmatter here\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/ok.md"], ids);
}

#[test]
fn reopen_stops_previous_watcher_exactly_once() {
    let state = Arc::new(AppState::new());
    let counter = Arc::new(AtomicUsize::new(0));
    state
        .install_watcher_handle(Box::new(CountingHandle {
            stop_calls: Arc::clone(&counter),
        }))
        .expect("install old watcher");

    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(1, counter.load(Ordering::SeqCst));
}

#[test]
fn reopen_clears_previous_write_ignore_paths() {
    let state = Arc::new(AppState::new());
    state
        .write_ignore()
        .register("tasks/dirty.md")
        .expect("register");
    assert!(!state.write_ignore().is_empty().expect("readable"));

    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert!(state.write_ignore().is_empty().expect("readable"));
}

#[test]
fn watcher_stop_panic_propagates_without_poisoning_watcher_handle_mutex() {
    // 新しい 4 段階フローでは旧 watcher の `stop()` は
    // `take_watcher_handle()` で取り出した後（lock 解放後）に呼ばれる。
    // panic は伝播するが watcher_handle mutex は poison しないため、
    // 後続 open は成功する。
    let state = Arc::new(AppState::new());
    state
        .install_watcher_handle(Box::new(PanickingHandle))
        .expect("install panicking watcher");

    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let panic_state = Arc::clone(&state);
    let panic_path = raw.clone();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
        let _ = open_with_noop(Arc::clone(&panic_state), &panic_path);
    }));
    assert!(result.is_err(), "stop panic should propagate");

    open_with_noop(Arc::clone(&state), &raw).expect("subsequent open should succeed");
}

#[test]
fn tasks_cache_uses_path_buf_keys_from_file_path() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let snapshot = state.tasks_snapshot().expect("readable");
    let mut paths: Vec<String> = snapshot
        .iter()
        .map(|t| t.file_path.as_str().to_string())
        .collect();
    paths.sort();
    assert_eq!(
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
        paths
    );
}

#[test]
fn watcher_init_failure_keeps_app_state_completely_unchanged() {
    // 1 回目の open で AppState を確定させる。
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    write_md(first_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let first_raw = first_dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &first_raw).expect("first open");

    let project_before = state.project_path().expect("readable");
    let config_before = state.config().expect("readable");
    let snapshot_before = state.tasks_snapshot().expect("readable");

    // 2 回目: prepare で WatcherInitFailed を返すスタブを使う。
    let other_dir = tempdir();
    let other_raw = other_dir.path().to_str().expect("utf-8").to_string();
    let err = open_project_with_factories(
        Arc::clone(&state),
        &other_raw,
        |_root| -> Result<(), OpenProjectError> {
            Err(OpenProjectError::WatcherInitFailed {
                source: spec_board_fs::watcher::core::WatcherError::Init(
                    "synthetic init failure".to_string(),
                ),
            })
        },
        |(), _state, _root, _config| Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
    )
    .expect_err("watcher init failure should be returned");
    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));

    // AppState の全フィールドが 1 回目の状態のまま残ることを確認する。
    assert_eq!(project_before, state.project_path().expect("readable"));
    assert_eq!(config_before, state.config().expect("readable"));
    let snapshot_after = state.tasks_snapshot().expect("readable");
    assert_eq!(snapshot_before.len(), snapshot_after.len());
    // watcher_handle はまだ前回の NoopWatcherHandle が install されたまま。
    let still_installed = state
        .take_watcher_handle()
        .expect("readable")
        .expect("watcher should still be present");
    drop(still_installed);
}

#[test]
fn watcher_init_failure_does_not_write_guide_md_in_new_dir() {
    // prepare が GUIDE.md 書き込みより前に呼ばれる契約を担保する。
    // watcher 初期化失敗時に新 dir 配下の `.spec-board/GUIDE.md` が副作用
    // として残らないことを確認する。
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err = open_project_with_factories(
        Arc::clone(&state),
        &raw,
        |_root| -> Result<(), OpenProjectError> {
            Err(OpenProjectError::WatcherInitFailed {
                source: spec_board_fs::watcher::core::WatcherError::Init(
                    "synthetic init failure".to_string(),
                ),
            })
        },
        |(), _state, _root, _config| Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
    )
    .expect_err("watcher init failure");
    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));

    let guide = dir.path().join(".spec-board").join("GUIDE.md");
    assert!(
        !guide.exists(),
        "GUIDE.md should not be written when watcher init fails"
    );
}

#[test]
fn watcher_init_failure_does_not_invoke_old_watcher_stop() {
    // 失敗 prepare のあとに `take_watcher_handle()` が呼ばれないことを担保する
    // ための回帰テスト。PanickingHandle が install されていても panic しない。
    let state = Arc::new(AppState::new());
    state
        .install_watcher_handle(Box::new(PanickingHandle))
        .expect("install panicking watcher");

    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err = open_project_with_factories(
        Arc::clone(&state),
        &raw,
        |_root| -> Result<(), OpenProjectError> {
            Err(OpenProjectError::WatcherInitFailed {
                source: spec_board_fs::watcher::core::WatcherError::Init("synth".to_string()),
            })
        },
        |(), _state, _root, _config| Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
    )
    .expect_err("watcher init failure");
    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));
}

#[test]
fn old_watcher_is_stopped_before_state_commit() {
    // CountingHandle を pre-install し、spawn factory 内で `tasks_snapshot`
    // が新値を返すこと、stop call カウンタが spawn 前に 1 になっていることを
    // 観察し、(1) prepare → (2) stop_old → (3) commit → (4) spawn の順序を
    // 検証する。
    let state = Arc::new(AppState::new());
    let stop_counter = Arc::new(AtomicUsize::new(0));
    state
        .install_watcher_handle(Box::new(CountingHandle {
            stop_calls: Arc::clone(&stop_counter),
        }))
        .expect("install old watcher");

    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let observed_counter = Arc::clone(&stop_counter);
    let observed_state = Arc::clone(&state);
    open_project_with_factories(
        Arc::clone(&state),
        &raw,
        |_root| Ok::<(), OpenProjectError>(()),
        move |(), _state, _root, _config| {
            // spawn 段階では旧 stop が既に呼ばれており、cache も新値で commit 済み。
            assert_eq!(1, observed_counter.load(Ordering::SeqCst));
            let snapshot = observed_state.tasks_snapshot().expect("readable");
            assert_eq!(1, snapshot.len());
            assert_eq!("tasks/a.md", snapshot[0].file_path);
            Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle
        },
    )
    .expect("open should succeed");

    assert_eq!(1, stop_counter.load(Ordering::SeqCst));
}

#[test]
fn previous_app_state_is_preserved_when_load_fails() {
    // 1 回目の open で AppState を確定させる。
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    write_md(first_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let first_raw = first_dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &first_raw).expect("first open should succeed");

    let snapshot_before = state.tasks_snapshot().expect("readable");
    let project_before = state.project_path().expect("readable");

    // 2 回目の open は config 不正で失敗させる。
    let bad_dir = tempdir();
    write_config_json(bad_dir.path(), "{ this is not json");
    let bad_raw = bad_dir.path().to_str().expect("utf-8").to_string();
    let err = open_with_noop(Arc::clone(&state), &bad_raw)
        .expect_err("second open with broken config should fail");
    assert!(matches!(err, OpenProjectError::ConfigLoadFailed { .. }));

    // 失敗時に前のプロジェクト state がそのまま残ることを担保する。
    let snapshot_after = state.tasks_snapshot().expect("readable");
    let project_after = state.project_path().expect("readable");
    assert_eq!(project_before, project_after);
    assert_eq!(snapshot_before.len(), snapshot_after.len());
    let file_paths_before: Vec<String> = snapshot_before
        .iter()
        .map(|t| t.file_path.as_str().to_string())
        .collect();
    let file_paths_after: Vec<String> = snapshot_after
        .iter()
        .map(|t| t.file_path.as_str().to_string())
        .collect();
    assert_eq!(file_paths_before, file_paths_after);
}

#[test]
fn write_ignore_error_lock_poisoned_maps_to_state_lock_poisoned() {
    use spec_board_fs::watcher::write_ignore::WriteIgnoreError;
    let err: OpenProjectError = WriteIgnoreError::LockPoisoned.into();
    assert!(matches!(err, OpenProjectError::StateLockPoisoned));
}

#[test]
fn write_ignore_error_non_poison_maps_to_scan_failed() {
    use spec_board_fs::watcher::write_ignore::WriteIgnoreError;
    let err: OpenProjectError = WriteIgnoreError::CleanupWorkerSpawnFailed.into();
    match err {
        OpenProjectError::ScanFailed { ref message } => {
            assert!(!message.is_empty());
        }
        other => panic!("expected ScanFailed, got {other:?}"),
    }
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

#[test]
fn open_project_payload_round_trip() {
    use serde::Deserialize;
    // OpenProjectPayload は #[derive(Serialize)] のみだが、JSON 形状互換を
    // round-trip で機械検証する。Deserialize を派生せずに `serde_json::Value`
    // 経由で再パースする。
    let json = r#"{"tasks":[],"columns":["Todo","Done"]}"#;
    #[derive(Debug, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct PayloadShape {
        tasks: Vec<serde_json::Value>,
        columns: Vec<String>,
    }
    let parsed: PayloadShape = serde_json::from_str(json).unwrap();
    assert_eq!(parsed.tasks.len(), 0);
    assert_eq!(parsed.columns, vec!["Todo".to_string(), "Done".to_string()]);

    // 反対方向: ColumnName VO の serde_transparent で文字列に戻ることを確認。
    let payload = OpenProjectPayload {
        tasks: vec![],
        columns: vec!["Todo".into(), "Done".into()],
    };
    let serialized = serde_json::to_string(&payload).unwrap();
    assert_eq!(serialized, r#"{"tasks":[],"columns":["Todo","Done"]}"#);
}

#[test]
fn empty_path_maps_to_directory_not_found_at_validate_directory_layer() {
    // open_project Tauri command 入口で `ProjectRoot::try_from_str("")` を
    // 呼ぶ前後で empty path 入力の挙動が同一であることを文書化する。
    //
    // 旧挙動: empty path は `validate_directory` の `fs::metadata("")` で
    //   ENOENT が返り、`DirectoryNotFound { path: "" }` に詰め直されていた。
    // 新挙動: command シンの `ProjectRoot::try_from_str("")` が
    //   `ProjectRootError::Empty` を返し、同じ `DirectoryNotFound { path: "" }`
    //   へ map される。
    // → FE 視点では Display 文字列も `TauriError` 分類も同一。
    //
    // 本テストは旧経路（`open_project_with_factories`）を直接駆動して
    // empty path が `DirectoryNotFound` に倒れることを確認する。
    let state = Arc::new(AppState::new());
    let err = open_with_noop(Arc::clone(&state), "").expect_err("empty path must yield error");
    match err {
        OpenProjectError::DirectoryNotFound { path } => assert_eq!(path, ""),
        other => panic!("expected DirectoryNotFound, got {other:?}"),
    }
}
