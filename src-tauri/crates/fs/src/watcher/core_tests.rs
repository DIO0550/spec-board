use super::*;
use crate::watcher::file_change_batch::FileChangeBatchTestBuilder;
use notify::event::{
    AccessKind, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind, RenameMode,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tempfile::TempDir;

// ─────────────────────────────────────────────────────────────────
// テストヘルパー
// ─────────────────────────────────────────────────────────────────

fn make_files(root: &Path, files: &[&str]) {
    for rel in files {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, "").unwrap();
    }
}

fn ev_with(kind: EventKind, paths: Vec<PathBuf>) -> NotifyEvent {
    NotifyEvent {
        kind,
        paths,
        attrs: Default::default(),
    }
}

fn ev_rescan() -> NotifyEvent {
    NotifyEvent::new(EventKind::Any).set_flag(notify::event::Flag::Rescan)
}

/// `target_path` を参照する [`FileChangeBatch`] が届くまで待つ。タイム
/// アウトに達した場合は `None` を返す。
fn wait_for_batch_at(
    rx: &Receiver<FileChangeBatch>,
    target_path: &Path,
    timeout: Duration,
) -> Option<FileChangeBatch> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = match deadline.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => r,
            _ => return None,
        };
        match rx.recv_timeout(remaining) {
            Ok(batch) => {
                if batch_paths(&batch).iter().any(|p| p == target_path) {
                    return Some(batch);
                }
            }
            Err(_) => return None,
        }
    }
}

/// 現在バッファされている batch を全て読み捨て、`quiet_window` の
/// 間に新規 batch が届かなくなった時点で復帰する。
fn drain_batches(rx: &Receiver<FileChangeBatch>, quiet_window: Duration) {
    loop {
        match rx.recv_timeout(quiet_window) {
            Ok(_) => continue,
            Err(_) => return,
        }
    }
}

/// チャネルが `Disconnected` を返すまで batch を読み続け、それまで
/// に取得した全 batch を返す。Drop 後に新規イベントが届かないこと
/// を検証するテスト用ヘルパー。
///
/// `overall_deadline` を上限として、`Drop` の teardown にリグレッ
/// ションが起きた場合や notify の platform-specific な挙動でチャネ
/// ルが永続的に Disconnect しない場合にテストスイート全体がハングし
/// ないようにしている。期限内に `Disconnected` を観測できなければ
/// 明示メッセージで panic する。
fn drain_until_disconnected(
    rx: &Receiver<FileChangeBatch>,
    per_recv_timeout: Duration,
    overall_deadline: Duration,
) -> Vec<FileChangeBatch> {
    let mut out = Vec::new();
    let stop_at = Instant::now() + overall_deadline;
    loop {
        let remaining = match stop_at.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => r,
            _ => panic!(
                "drain_until_disconnected: channel did not Disconnect within {overall_deadline:?} \
                 (collected {n} batches so far)",
                n = out.len()
            ),
        };
        let next_timeout = std::cmp::min(per_recv_timeout, remaining);
        match rx.recv_timeout(next_timeout) {
            Ok(batch) => out.push(batch),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return out,
        }
    }
}

/// batch が言及する全 path（removed + upserted）。
fn batch_paths(batch: &FileChangeBatch) -> Vec<PathBuf> {
    batch
        .removed()
        .iter()
        .chain(batch.upserted().iter())
        .cloned()
        .collect()
}

/// 収集した batch 群の中で `target` が `upserted` に現れた回数。
fn upsert_count(batches: &[FileChangeBatch], target: &Path) -> usize {
    batches
        .iter()
        .flat_map(|batch| batch.upserted().iter())
        .filter(|path| path.as_path() == target)
        .count()
}

/// 収集した batch 群の中で `target` が `removed` に現れた回数。
fn removed_count(batches: &[FileChangeBatch], target: &Path) -> usize {
    batches
        .iter()
        .flat_map(|batch| batch.removed().iter())
        .filter(|path| path.as_path() == target)
        .count()
}

// ─────────────────────────────────────────────────────────────────
// convert_event: パラメタライズドテーブル
// ─────────────────────────────────────────────────────────────────

#[test]
fn convert_event_table() {
    let p1 = PathBuf::from("/tmp/a");
    let p2 = PathBuf::from("/tmp/b");

    struct Case {
        name: &'static str,
        kind: EventKind,
        paths: Vec<PathBuf>,
        expected: Option<Vec<FsEvent>>,
    }

    let cases = vec![
        Case {
            name: "Create -> Created",
            kind: EventKind::Create(CreateKind::File),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Created(p1.clone())]),
        },
        Case {
            name: "Modify(Data) -> Modified",
            kind: EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Modified(p1.clone())]),
        },
        Case {
            name: "Modify(Metadata) -> Modified",
            kind: EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Modified(p1.clone())]),
        },
        Case {
            name: "Modify(Name) + 2 paths -> Renamed",
            kind: EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            paths: vec![p1.clone(), p2.clone()],
            expected: Some(vec![FsEvent::Renamed {
                from: p1.clone(),
                to: p2.clone(),
            }]),
        },
        Case {
            name: "Modify(Name) + 1 path -> Other (downgraded)",
            kind: EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Other(p1.clone())]),
        },
        Case {
            name: "Remove -> Removed",
            kind: EventKind::Remove(RemoveKind::File),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Removed(p1.clone())]),
        },
        Case {
            name: "Access -> Other",
            kind: EventKind::Access(AccessKind::Any),
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Other(p1.clone())]),
        },
        Case {
            name: "Any -> Other",
            kind: EventKind::Any,
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Other(p1.clone())]),
        },
        Case {
            name: "Other -> Other",
            kind: EventKind::Other,
            paths: vec![p1.clone()],
            expected: Some(vec![FsEvent::Other(p1.clone())]),
        },
        Case {
            name: "empty paths -> None",
            kind: EventKind::Create(CreateKind::File),
            paths: vec![],
            expected: None,
        },
    ];

    for c in cases {
        let actual = convert_event(ev_with(c.kind, c.paths.clone()));
        assert_eq!(actual, c.expected, "case `{}` failed", c.name);
    }
}

#[test]
fn convert_event_emits_rescan_when_backend_signals_overflow() {
    let actual = convert_event(ev_rescan());
    assert_eq!(
        actual,
        Some(vec![FsEvent::Rescan]),
        "rescan-flagged events must surface as FsEvent::Rescan even when paths are empty"
    );
}

// ─────────────────────────────────────────────────────────────────
// validate_path のテスト
// ─────────────────────────────────────────────────────────────────

#[test]
fn validate_path_accepts_existing_directory() {
    let dir = TempDir::new().unwrap();
    validate_path(dir.path()).expect("existing directory should be accepted");
}

#[test]
fn validate_path_rejects_missing_path() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("does_not_exist");
    let err = validate_path(&missing).unwrap_err();
    assert!(
        matches!(err, WatcherError::PathNotFound(p) if p == missing),
        "expected PathNotFound for missing path"
    );
}

#[test]
fn validate_path_rejects_regular_file() {
    let dir = TempDir::new().unwrap();
    make_files(dir.path(), &["a.md"]);
    let file = dir.path().join("a.md");
    let err = validate_path(&file).unwrap_err();
    assert!(
        matches!(err, WatcherError::PathNotFound(p) if p == file),
        "expected PathNotFound for regular file"
    );
}

#[test]
fn watcher_error_pathnotfound_displays_the_path() {
    let p = PathBuf::from("/no/such/path");
    let err = WatcherError::PathNotFound(p.clone());
    let s = err.to_string();
    assert!(
        s.contains(p.display().to_string().as_str()),
        "error message must include the rejected path; got: {s}"
    );
}

// ─────────────────────────────────────────────────────────────────
// build_backend_with: 決定的なフォールバック単体テスト
// ─────────────────────────────────────────────────────────────────

/// テスト用に poll バックエンドを 1 つ構築し、[`Backend`] と監視
/// ルートを所有する [`TempDir`] ガードを返す。呼び出し側で両方をロー
/// カルにバインドすれば、テストスコープ終了時に一時ディレクトリが
/// 削除され、メモリと一時ディレクトリのリークを避けられる。
fn make_dummy_backend() -> (Backend, TempDir) {
    let dir = TempDir::new().unwrap();
    let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let backend = build_poll_backend(tx, dir.path()).expect("poll backend should build for tests");
    (backend, dir)
}

#[test]
fn build_backend_with_returns_recommended_when_ok() {
    let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let path = PathBuf::from("/tmp");
    let (dummy, _dir_guard) = make_dummy_backend();
    let recommended_called = Arc::new(AtomicBool::new(false));
    let poll_called = Arc::new(AtomicBool::new(false));
    let r_flag = Arc::clone(&recommended_called);
    let p_flag = Arc::clone(&poll_called);
    let _backend = build_backend_with(
        tx,
        &path,
        move |_t, _p| {
            r_flag.store(true, Ordering::SeqCst);
            Ok(dummy)
        },
        move |_t, _p| {
            p_flag.store(true, Ordering::SeqCst);
            Err(notify::Error::generic("poll should not be called"))
        },
    )
    .expect("should return recommended backend when its constructor succeeds");
    assert!(
        recommended_called.load(Ordering::SeqCst),
        "recommended constructor must be called"
    );
    assert!(
        !poll_called.load(Ordering::SeqCst),
        "poll constructor must not be called when recommended succeeds"
    );
}

#[test]
fn build_backend_with_falls_back_when_recommended_new_fails() {
    let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let path = PathBuf::from("/tmp");
    let (dummy, _dir_guard) = make_dummy_backend();
    let recommended_called = Arc::new(AtomicBool::new(false));
    let poll_called = Arc::new(AtomicBool::new(false));
    let r_flag = Arc::clone(&recommended_called);
    let p_flag = Arc::clone(&poll_called);
    let backend = build_backend_with(
        tx,
        &path,
        move |_t, _p| {
            r_flag.store(true, Ordering::SeqCst);
            Err(notify::Error::generic("new failed: inotify limit"))
        },
        move |_t, _p| {
            p_flag.store(true, Ordering::SeqCst);
            Ok(dummy)
        },
    )
    .expect("should fall back to poll backend");
    assert!(
        recommended_called.load(Ordering::SeqCst),
        "recommended constructor must be tried first"
    );
    assert!(
        poll_called.load(Ordering::SeqCst),
        "poll constructor must be invoked as fallback"
    );
    assert!(
        matches!(backend, Backend::Poll(_)),
        "fallback must return a Poll backend"
    );
}

#[test]
fn build_backend_with_falls_back_when_recommended_watch_fails() {
    let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let path = PathBuf::from("/tmp");
    let (dummy, _dir_guard) = make_dummy_backend();
    let recommended_called = Arc::new(AtomicBool::new(false));
    let poll_called = Arc::new(AtomicBool::new(false));
    let r_flag = Arc::clone(&recommended_called);
    let p_flag = Arc::clone(&poll_called);
    let backend = build_backend_with(
        tx,
        &path,
        move |_t, _p| {
            r_flag.store(true, Ordering::SeqCst);
            Err(notify::Error::generic("watch failed: too many watches"))
        },
        move |_t, _p| {
            p_flag.store(true, Ordering::SeqCst);
            Ok(dummy)
        },
    )
    .expect("should fall back to poll backend on watch failure");
    assert!(
        recommended_called.load(Ordering::SeqCst),
        "recommended constructor must be tried first"
    );
    assert!(
        poll_called.load(Ordering::SeqCst),
        "poll constructor must be invoked when watch() fails"
    );
    assert!(
        matches!(backend, Backend::Poll(_)),
        "watch-failure fallback must return a Poll backend"
    );
}

#[test]
fn build_backend_with_returns_init_when_both_fail() {
    let (tx, _rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let path = PathBuf::from("/tmp");
    let recommended_path = PathBuf::from("/watch/recommended");
    let poll_path = PathBuf::from("/watch/poll");
    let recommended_error =
        notify::Error::new(notify::ErrorKind::MaxFilesWatch).add_path(recommended_path.clone());
    let recommended_detail = recommended_error.to_string();
    let poll_error = notify::Error::io(std::io::Error::from(std::io::ErrorKind::PermissionDenied))
        .add_path(poll_path.clone());
    let poll_detail = poll_error.to_string();
    let result = build_backend_with(
        tx,
        &path,
        |_t, _p| Err(recommended_error),
        |_t, _p| Err(poll_error),
    );
    let error = match result {
        Ok(_) => panic!("both backend failures must return typed diagnostics"),
        Err(error) => error,
    };
    let expected_display = format!(
        "failed to initialize file system watcher: recommended watcher failed: \
         {recommended_detail}; poll watcher failed: {poll_detail}"
    );
    assert_eq!(expected_display, error.to_string());
    let WatcherError::Init { recommended, poll } = error else {
        panic!("expected Init, got {error:?}");
    };
    assert_eq!(WatcherFailureKind::ResourceExhausted, recommended.kind);
    assert_eq!(vec![recommended_path], recommended.paths);
    assert_eq!(recommended_detail, recommended.detail);
    assert_eq!(recommended.detail, recommended.to_string());
    assert_eq!(WatcherFailureKind::PermissionDenied, poll.kind);
    assert_eq!(vec![poll_path], poll.paths);
    assert_eq!(poll_detail, poll.detail);
    assert_eq!(poll.detail, poll.to_string());
}

// ─────────────────────────────────────────────────────────────────
// アダプタスレッド: ランタイムエラー伝播
// ─────────────────────────────────────────────────────────────────

#[test]
fn spawn_adapter_translates_runtime_error_into_a_failure_batch() {
    let (tx, rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(rx);

    let nerr = notify::Error::generic("backend exploded");
    tx.send(Err(nerr)).unwrap();

    let batch = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("should receive a failure batch");
    let [failure] = batch.errors() else {
        panic!("expected exactly one failure, got {:?}", batch.errors());
    };
    assert!(
        failure.detail.contains("backend exploded"),
        "detail must include the source: {}",
        failure.detail
    );
    assert_eq!(WatcherFailureKind::Unknown, failure.kind);
    assert!(!batch.is_rescan(), "障害 batch は rescan を立てない");
    assert!(
        batch_paths(&batch).is_empty(),
        "障害 batch に path は載らない"
    );

    drop(tx);
    let _ = handle.join();
}

// ─────────────────────────────────────────────────────────────────
// classify_notify_error: notify のランタイムエラー → WatcherFailure
// ─────────────────────────────────────────────────────────────────

#[test]
fn classify_notify_error_maps_every_failure_kind() {
    struct Case {
        name: &'static str,
        build: fn() -> notify::Error,
        expected: WatcherFailureKind,
    }

    let cases = vec![
        Case {
            name: "監視対象が消えた（PathNotFound）",
            build: notify::Error::path_not_found,
            expected: WatcherFailureKind::WatchPathUnavailable,
        },
        Case {
            name: "監視登録が失われた（WatchNotFound）",
            build: notify::Error::watch_not_found,
            expected: WatcherFailureKind::WatchPathUnavailable,
        },
        Case {
            name: "監視対象が I/O レベルで消えた（Io(NotFound)）",
            build: || notify::Error::io(std::io::Error::from(std::io::ErrorKind::NotFound)),
            expected: WatcherFailureKind::WatchPathUnavailable,
        },
        Case {
            name: "OS の監視資源が枯渇した（MaxFilesWatch）",
            build: || notify::Error::new(notify::ErrorKind::MaxFilesWatch),
            expected: WatcherFailureKind::ResourceExhausted,
        },
        Case {
            name: "資源枯渇が I/O レベルで出た（Io(StorageFull)）",
            build: || notify::Error::io(std::io::Error::from(std::io::ErrorKind::StorageFull)),
            expected: WatcherFailureKind::ResourceExhausted,
        },
        Case {
            name: "権限不足（Io(PermissionDenied)）",
            build: || notify::Error::io(std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
            expected: WatcherFailureKind::PermissionDenied,
        },
        Case {
            name: "一般 I/O エラー（Io(BrokenPipe)）",
            build: || notify::Error::io(std::io::Error::from(std::io::ErrorKind::BrokenPipe)),
            expected: WatcherFailureKind::Io,
        },
        Case {
            name: "backend 固有で分類できない（Generic）",
            build: || notify::Error::generic("weird backend state"),
            expected: WatcherFailureKind::Unknown,
        },
        Case {
            name: "設定不正も分類不能に倒す（InvalidConfig）",
            build: || notify::Error::invalid_config(&NotifyConfig::default()),
            expected: WatcherFailureKind::Unknown,
        },
    ];

    for case in cases {
        let err = (case.build)();
        let expected_detail = err.to_string();
        let failure = classify_notify_error(err);
        assert_eq!(
            case.expected, failure.kind,
            "{}: kind が期待と異なる",
            case.name
        );
        assert_eq!(
            expected_detail, failure.detail,
            "{}: detail に元メッセージが残るべき",
            case.name
        );
    }
}

#[test]
fn classify_notify_error_keeps_paths_reported_by_backend() {
    let err = notify::Error::path_not_found()
        .add_path(PathBuf::from("/tmp/a"))
        .add_path(PathBuf::from("/tmp/b"));

    let failure = classify_notify_error(err);

    assert_eq!(
        vec![PathBuf::from("/tmp/a"), PathBuf::from("/tmp/b")],
        failure.paths
    );
}

#[test]
fn classify_notify_error_yields_empty_paths_when_backend_reports_none() {
    let failure = classify_notify_error(notify::Error::generic("no paths here"));

    assert!(
        failure.paths.is_empty(),
        "backend が path を提示しない場合は空 Vec になるべき"
    );
}

// ─────────────────────────────────────────────────────────────────
// notify_config の sanity チェック
// ─────────────────────────────────────────────────────────────────

#[test]
fn notify_config_can_be_constructed() {
    let _c: NotifyConfig = notify_config();
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: Watcher::start (recommended バックエンド)
// ─────────────────────────────────────────────────────────────────

#[test]
fn watcher_start_observes_top_level_file_creation() {
    let dir = TempDir::new().unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

    let target = dir.path().join("a.md");
    std::fs::write(&target, b"hello").unwrap();

    let batch = wait_for_batch_at(&rx, &target, Duration::from_secs(5))
        .expect("should observe a batch for the new file");
    assert!(
        batch.upserted().contains(&target),
        "新規ファイルは upserted に載るべき: {batch:?}"
    );

    drop(watcher);
}

#[test]
fn watcher_start_observes_nested_file_creation() {
    let dir = TempDir::new().unwrap();
    // 監視開始前にサブディレクトリを作成しておき、再帰バックエンド
    // が起動時点でそれを登録できるようにする。新規作成された子孫
    // ディレクトリが、最初の子ファイル書き込みまでに inotify で監視
    // されない可能性があるレース条件を回避するため。
    let sub = dir.path().join("sub");
    std::fs::create_dir_all(&sub).unwrap();

    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

    let target = sub.join("nested.md");
    std::fs::write(&target, b"nested").unwrap();

    let batch = wait_for_batch_at(&rx, &target, Duration::from_secs(5))
        .expect("should observe a batch for nested file");
    assert!(
        batch.upserted().contains(&target),
        "ネストしたファイルも upserted に載るべき: {batch:?}"
    );

    drop(watcher);
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: poll フォールバック
// ─────────────────────────────────────────────────────────────────

#[test]
fn watcher_start_with_poll_observes_file_creation() {
    let dir = TempDir::new().unwrap();
    let (watcher, rx) = Watcher::start_with_poll(dir.path()).expect("poll start should succeed");

    let target = dir.path().join("polled.md");
    std::fs::write(&target, b"polled").unwrap();

    // PollWatcher は 2 秒間隔のため、余裕を持たせたタイムアウトを設定する。
    let batch = wait_for_batch_at(&rx, &target, Duration::from_secs(8))
        .expect("poll backend should eventually observe the file");
    assert!(
        batch.upserted().contains(&target),
        "poll backend でも upserted に載るべき: {batch:?}"
    );

    drop(watcher);
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: Drop が新規イベントを同期的に停止することを検証
// ─────────────────────────────────────────────────────────────────

#[test]
fn dropping_watcher_blocks_new_events() {
    let dir = TempDir::new().unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");

    // アダプタが起動して処理を開始していることを保証するため、
    // 軽くトラフィックを発生させる。
    let warmup = dir.path().join("warmup.md");
    std::fs::write(&warmup, b"warm").unwrap();
    let _ = wait_for_batch_at(&rx, &warmup, Duration::from_secs(5));

    // ウォームアップで発生した残 batch を読み捨てる。
    drain_batches(&rx, Duration::from_millis(200));

    // 同期的にウォッチャを停止する。
    drop(watcher);

    // Drop 後にユニーク名のファイルを作成する。receiver から取り出
    // すどのイベントにも、このファイルへの参照が含まれてはならない。
    let marker_name = format!("drop_marker_{}.md", std::process::id());
    let marker = dir.path().join(&marker_name);
    std::fs::write(&marker, b"after-drop").unwrap();

    let queued = drain_until_disconnected(&rx, Duration::from_millis(300), Duration::from_secs(10));

    let any_marker = queued
        .iter()
        .any(|batch| batch_paths(batch).iter().any(|p| p == &marker));
    assert!(
        !any_marker,
        "no batch referencing {marker_name} should appear after Drop; got {queued:?}"
    );
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: エラーケース
// ─────────────────────────────────────────────────────────────────

#[test]
fn watcher_start_returns_pathnotfound_for_missing_path() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("does_not_exist");
    match Watcher::start(&missing) {
        Ok(_) => panic!("expected start to fail for missing path"),
        Err(WatcherError::PathNotFound(p)) => assert_eq!(p, missing),
        Err(other) => panic!("expected PathNotFound, got {other:?}"),
    }
}

#[test]
fn watcher_start_returns_pathnotfound_for_regular_file() {
    let dir = TempDir::new().unwrap();
    make_files(dir.path(), &["solo.md"]);
    let file = dir.path().join("solo.md");
    match Watcher::start(&file) {
        Ok(_) => panic!("expected start to fail for regular file"),
        Err(WatcherError::PathNotFound(p)) => assert_eq!(p, file),
        Err(other) => panic!("expected PathNotFound, got {other:?}"),
    }
}

// ─────────────────────────────────────────────────────────────────
// 任意: root が symlink ディレクトリの場合も受け入れることを検証
// ─────────────────────────────────────────────────────────────────

#[cfg(unix)]
#[test]
fn watcher_start_accepts_symlink_directory_root() {
    let dir = TempDir::new().unwrap();
    let real = dir.path().join("real");
    std::fs::create_dir_all(&real).unwrap();
    let link = dir.path().join("link");
    std::os::unix::fs::symlink(&real, &link).unwrap();

    let (watcher, _rx) = Watcher::start(&link).expect("symlink directory root should be accepted");
    drop(watcher);
}

// ─────────────────────────────────────────────────────────────────
// 純粋ロジック: DEBOUNCE_DURATION
//
// 保留の畳み込み（record / drain_due / drain_all / next_wait）の単体
// テストは `pending_changes_tests.rs` に置いている。
// ─────────────────────────────────────────────────────────────────

#[test]
fn debounce_duration_constant_is_100ms() {
    assert_eq!(DEBOUNCE_DURATION, Duration::from_millis(100));
}

// ─────────────────────────────────────────────────────────────────
// adapter スレッドの決定論テスト（`spawn_adapter` に `notify::Event`
// を直接投入する）。
//
// 実 FS イベントには依存しないため、ファイルシステムの遅延・並列
// 性・OS バックエンド差異に起因するフレーキーは排除できる。一方、
// adapter 内部のスライディングウィンドウは時間ベース（`Instant` /
// `recv_timeout` / `thread::sleep`）で動くため、テストにも時間待
// ちは残る。CI のスレッドスケジューリング遅延を吸収するため、各
// `recv_timeout` には寛大なタイムアウト（数百 ms 〜数秒）を設け、
// 絶対時間ではなくイベント順序で仕様を検証している。
// 複数 path の同一 batch 集約と deadline 順（同点は path 順）は、
// 固定 `Instant` を使う `pending_changes_tests` で決定的に検証する。
// ─────────────────────────────────────────────────────────────────

fn modify_event(path: &Path) -> NotifyEvent {
    ev_with(
        EventKind::Modify(ModifyKind::Data(DataChange::Any)),
        vec![path.to_path_buf()],
    )
}

fn rename_both_event(from: &Path, to: &Path) -> NotifyEvent {
    ev_with(
        EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
        vec![from.to_path_buf(), to.to_path_buf()],
    )
}

#[test]
fn spawn_adapter_emits_a_single_batch_after_the_debounce_window() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_single");

    notify_tx.send(Ok(modify_event(&path))).unwrap();

    // 「ウィンドウ満了前は届かない」を short timeout で検証すると、
    // CI 負荷でテストスレッドが 100ms 以上スケジュールされない場合
    // に batch が既に到着していて偽陽性になり得るため、ここでは
    // 件数ベースの検証だけ行う:「最終的にちょうど 1 batch 届くこと」
    // 「以降に余分な batch は続かないこと」。
    let batch = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("debounce 満了後に batch が届くべき");
    assert_eq!(vec![path], batch.upserted());
    assert!(batch.removed().is_empty());

    assert!(
        matches!(
            fs_rx.recv_timeout(Duration::from_millis(300)),
            Err(RecvTimeoutError::Timeout)
        ),
        "1 回投入につき発火は 1 batch のみであるべき"
    );

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_slides_deadline_when_same_path_arrives_within_window() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_slide");

    // 同一 path に 2 回連続投入。間の sleep は「2 回目を 1 回目の
    // debounce window (DEBOUNCE_DURATION = 100ms) 内に入れる」ため
    // に挟む。2 回目が window を跨ぐと別 batch として 2 件発火し
    // 件数アサーションが崩れるため、sleep は window に対して十分
    // 小さく（10ms）し、低速 CI でのスケジューリング遅延に対する
    // 余裕（約 90ms）を確保する。
    notify_tx.send(Ok(modify_event(&path))).unwrap();
    std::thread::sleep(Duration::from_millis(10));
    notify_tx.send(Ok(modify_event(&path))).unwrap();

    let batch = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("debounce 満了後に 1 batch 届くべき");
    assert_eq!(
        vec![path],
        batch.upserted(),
        "同一 path は 1 エントリに畳まれるべき"
    );

    assert!(
        matches!(
            fs_rx.recv_timeout(Duration::from_millis(300)),
            Err(RecvTimeoutError::Timeout)
        ),
        "sliding 集約により 2 回投入でも発火は 1 batch のみであるべき"
    );

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_flushes_remaining_pending_as_one_batch_on_notify_tx_drop() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let first = PathBuf::from("/tmp/test_flush_a");
    let second = PathBuf::from("/tmp/test_flush_b");

    notify_tx.send(Ok(modify_event(&first))).unwrap();
    notify_tx.send(Ok(modify_event(&second))).unwrap();
    // ウィンドウ満了 (DEBOUNCE_DURATION = 100ms) より十分前に上流を
    // drop する。drop が遅れて満了を跨ぐと先に通常発火してしまうため、
    // sleep は短く（10ms）して低速 CI での遅延余裕を確保する。
    std::thread::sleep(Duration::from_millis(10));
    drop(notify_tx);

    let batch = fs_rx
        .recv_timeout(Duration::from_millis(500))
        .expect("Drop 時に保留が flush されるべき");
    assert_eq!(
        vec![first, second],
        batch.upserted(),
        "残保留は 1 batch にまとまり、deadline 昇順で並ぶべき"
    );

    let next = fs_rx.recv_timeout(Duration::from_millis(500));
    assert!(
        matches!(next, Err(RecvTimeoutError::Disconnected)),
        "flush 後はチャネルが切断されるべき: got {next:?}"
    );

    let _ = handle.join();
}

#[test]
fn spawn_adapter_forwards_rescan_immediately_bypassing_pending_changes() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_rescan_bypass");

    // Modified を投入して pending 入りさせ、短い間隔を空けて Rescan を
    // 投入する。保留 Modified は DEBOUNCE_DURATION (100ms) 経過後に発火
    // する仕様のため、sleep は window より十分小さく（5ms）して、
    // Rescan 投入前に保留が満了してしまう余地を最小化する。
    notify_tx.send(Ok(modify_event(&path))).unwrap();
    std::thread::sleep(Duration::from_millis(5));
    notify_tx.send(Ok(ev_rescan())).unwrap();

    // 絶対時間ではなく **順序** で bypass 仕様を検証する。CI 負荷時の
    // スレッドスケジューリング遅延に耐性を持たせるため、両 recv に
    // 寛大なタイムアウトを設定する。保留は debounce 窓に gate される
    // ため、rescan batch が先に届くことが bypass の十分条件となる。
    let first = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("Rescan が先に届くべき（保留を追い越す）");
    let second = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("保留は Rescan の後に発火すべき（破棄されない）");

    assert_eq!(
        FileChangeBatchTestBuilder::rescan().build(),
        first,
        "rescan 専用 batch が先に届くべき"
    );
    assert_eq!(vec![path], second.upserted());

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_forwards_backend_failure_immediately_bypassing_pending_changes() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_error_bypass");

    notify_tx.send(Ok(modify_event(&path))).unwrap();
    std::thread::sleep(Duration::from_millis(5));
    notify_tx
        .send(Err(notify::Error::generic("backend exploded")))
        .unwrap();

    let first = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("Error が先に届くべき（保留を追い越す）");
    let second = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("保留は Error の後に発火すべき（破棄されない）");

    assert_eq!(1, first.errors().len(), "障害 batch は errors だけを持つ");
    assert!(
        batch_paths(&first).is_empty(),
        "障害 batch に path は載らない: {first:?}"
    );
    assert_eq!(vec![path], second.upserted());

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_keeps_the_renamed_from_path_when_modify_follows_for_the_to_path() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let from = PathBuf::from("/tmp/test_rename_from");
    let to = PathBuf::from("/tmp/test_rename_to");

    // Modify を Renamed の debounce window (DEBOUNCE_DURATION = 100ms)
    // 内に入れるための sleep。window を跨ぐと 2 batch に分かれて畳み
    // 込みの検証が崩れるため、sleep は window より十分小さく（10ms）
    // する。
    notify_tx.send(Ok(rename_both_event(&from, &to))).unwrap();
    std::thread::sleep(Duration::from_millis(10));
    notify_tx.send(Ok(modify_event(&to))).unwrap();

    // deadline は path ごとに独立してスライドするため、後続 Modified で
    // 延長された `to` は `from` より後の batch に載ることがある。ここで
    // 固定したいのは「rename 元の削除が失われない」ことと「削除が upsert
    // より先に届く」ことなので、batch をまたいだ合計と順序で検証する。
    let batches = collect_all_batches(&fs_rx, Duration::from_secs(2), Duration::from_millis(300));
    assert_eq!(
        1,
        removed_count(&batches, &from),
        "後続の Modified(to) で rename 元の削除が失われてはならない: {batches:?}"
    );
    assert_eq!(
        1,
        upsert_count(&batches, &to),
        "rename 先の upsert はちょうど 1 回: {batches:?}"
    );
    let removed_at = batches
        .iter()
        .position(|batch| batch.removed().contains(&from))
        .expect("rename 元の削除を含む batch があるべき");
    let upserted_at = batches
        .iter()
        .position(|batch| batch.upserted().contains(&to))
        .expect("rename 先の upsert を含む batch があるべき");
    assert!(
        removed_at <= upserted_at,
        "旧 path の削除は新 path の登録より先に届くべき: {batches:?}"
    );

    drop(notify_tx);
    let _ = handle.join();
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: 実 FS でデバウンス挙動を確認
// ─────────────────────────────────────────────────────────────────

/// `target` に言及する batch を 1 件以上収集する。バックエンドが
/// Created を発火するか Modified を発火するか、または両方を返すかは
/// OS / バックエンド依存のため、デバウンス効果（batch 件数の縮減）に
/// 焦点を当てて集計する。
fn collect_batches_for(
    rx: &Receiver<FileChangeBatch>,
    target: &Path,
    overall: Duration,
    quiet: Duration,
) -> Vec<FileChangeBatch> {
    let mut out = Vec::new();
    let stop = Instant::now() + overall;
    loop {
        let remaining = match stop.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => std::cmp::min(r, quiet),
            _ => break,
        };
        match rx.recv_timeout(remaining) {
            Ok(batch) => {
                if batch_paths(&batch).iter().any(|p| p == target) {
                    out.push(batch);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                if !out.is_empty() {
                    break;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    out
}

#[test]
fn watcher_debounces_consecutive_writes_to_same_file() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("burst.md");
    // 監視開始時にファイルを存在させておく（Created を抑制し、
    // Modified の集約に焦点を絞るため）。
    std::fs::write(&target, b"init").unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");
    // 初期 Created 等を読み捨てる。
    drain_batches(&rx, Duration::from_millis(300));

    // sleep を入れずにバーストで書き込む。CI 負荷で sleep が伸びる
    // と「100ms 内」の前提が崩れるため、回数を増やしつつ間隔は OS
    // スレッドのスケジュール粒度に任せる。
    for i in 0..20 {
        std::fs::write(&target, format!("v{i}").as_bytes()).unwrap();
    }

    // E2E sanity check: debounce が「大幅に batch を集約している」
    // ことのみ検証する。kernel の inotify イベント配信が CI 負荷で
    // 100ms ウィンドウを跨ぐ場合に 2 件以上に分かれることはあり得
    // るため、strict `== 1` ではなく許容範囲（≥1 かつ ≤3）で判定
    // する。debounce が機能していなければ kernel が返す件数（数件
    // 〜十数件）がそのまま届くため、≤3 で十分に集約効果を検出で
    // きる。strict な sliding 仕様の検証は adapter-level の決定論
    // テスト（spawn_adapter_*）で担保している。
    let batches = collect_batches_for(
        &rx,
        &target,
        Duration::from_secs(5),
        Duration::from_millis(400),
    );
    assert!(
        !batches.is_empty() && batches.len() <= 3,
        "20 連続書き込みは debounce で ≤3 batch に集約されるべき: got {} 件 {batches:?}",
        batches.len()
    );
    for batch in &batches {
        assert_eq!(
            1,
            upsert_count(std::slice::from_ref(batch), &target),
            "1 batch の中で同一 path は 1 回しか現れないべき: {batch:?}"
        );
    }

    drop(watcher);
}

#[test]
fn watcher_emits_separate_batches_when_writes_are_spaced_beyond_window() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("spaced.md");
    std::fs::write(&target, b"init").unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");
    drain_batches(&rx, Duration::from_millis(300));

    // 2 回の書き込みを別 batch として発火させるには、間隔が debounce
    // window (DEBOUNCE_DURATION = 100ms) を確実に超える必要がある。
    // 実 FS / inotify の配信遅延が CI 負荷でブレても 1 件に collapse
    // しないよう、window の数倍 (400ms) の間隔を空ける。
    std::fs::write(&target, b"v1").unwrap();
    std::thread::sleep(Duration::from_millis(400));
    std::fs::write(&target, b"v2").unwrap();

    let batches = collect_batches_for(
        &rx,
        &target,
        Duration::from_secs(5),
        Duration::from_millis(400),
    );
    assert_eq!(
        batches.len(),
        2,
        "400ms 間隔の 2 回書き込みは別 batch として発火するべき: got {batches:?}"
    );

    drop(watcher);
}

/// `quiet` の間に新規 batch が届かなくなるか `overall` が経過する
/// まで全 batch を収集する。`collect_batches_for` と異なり target に
/// よるフィルタリングを行わず、複数 target に対する独立性を検証する
/// テストで使う。
fn collect_all_batches(
    rx: &Receiver<FileChangeBatch>,
    overall: Duration,
    quiet: Duration,
) -> Vec<FileChangeBatch> {
    let mut out = Vec::new();
    let stop = Instant::now() + overall;
    loop {
        let remaining = match stop.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => std::cmp::min(r, quiet),
            _ => break,
        };
        match rx.recv_timeout(remaining) {
            Ok(batch) => out.push(batch),
            Err(RecvTimeoutError::Timeout) => {
                if !out.is_empty() {
                    break;
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    out
}

#[test]
fn watcher_debounces_per_file_independently() {
    let dir = TempDir::new().unwrap();
    let a = dir.path().join("a.md");
    let b = dir.path().join("b.md");
    std::fs::write(&a, b"init").unwrap();
    std::fs::write(&b, b"init").unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");
    drain_batches(&rx, Duration::from_millis(300));

    // sleep を入れずにバーストで書き込む（CI 負荷耐性のため）。
    // a と b に交互に複数回書き込む。
    for i in 0..15 {
        std::fs::write(&a, format!("a{i}").as_bytes()).unwrap();
        std::fs::write(&b, format!("b{i}").as_bytes()).unwrap();
    }

    // E2E sanity check: 各 path が独立に集約されることを検証する。
    // kernel の inotify 配信タイミングが CI 負荷でブレるため、件数
    // は strict `== 1` ではなく許容範囲（≥1 かつ ≤3）で判定する。
    // 重要な不変条件は「a と b が独立して計上される（混ざらない・
    // 取りこぼさない）」こと。strict な sliding 仕様は
    // adapter-level の決定論テストで担保している。
    let all = collect_all_batches(&rx, Duration::from_secs(5), Duration::from_millis(400));
    let count_a = upsert_count(&all, &a);
    let count_b = upsert_count(&all, &b);
    assert!(
        (1..=3).contains(&count_a),
        "ファイル a の連続書き込みは ≤3 回に集約: got {count_a} 回 (all={all:?})"
    );
    assert!(
        (1..=3).contains(&count_b),
        "ファイル b の連続書き込みは ≤3 回に集約: got {count_b} 回 (all={all:?})"
    );

    drop(watcher);
}

#[test]
fn watcher_removes_the_old_path_when_a_rename_is_followed_by_a_write() {
    let dir = TempDir::new().unwrap();
    let old = dir.path().join("old.md");
    let new = dir.path().join("new.md");
    std::fs::write(&old, b"init").unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");
    drain_batches(&rx, Duration::from_millis(300));

    // rename 直後（debounce window 内）の保存を再現する。sleep は
    // window (100ms) より十分小さくして、2 つの変更が同一ウィンドウ
    // に入る確率を高める。跨いだ場合でも batch をまたいだ合計で
    // 検証するため、期待値は崩れない。
    std::fs::rename(&old, &new).unwrap();
    std::thread::sleep(Duration::from_millis(10));
    std::fs::write(&new, b"updated").unwrap();

    let all = collect_all_batches(&rx, Duration::from_secs(5), Duration::from_millis(400));
    assert_eq!(
        1,
        removed_count(&all, &old),
        "rename 元の削除がちょうど 1 回届くべき: {all:?}"
    );
    assert_eq!(
        1,
        upsert_count(&all, &new),
        "rename 先の upsert がちょうど 1 回届くべき: {all:?}"
    );

    drop(watcher);
}

#[test]
fn watcher_with_poll_debounces_consecutive_writes() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("polled-burst.md");
    std::fs::write(&target, b"init").unwrap();
    let (watcher, rx) = Watcher::start_with_poll(dir.path()).expect("poll start should succeed");
    // Poll は 2 秒間隔のため、初期スキャン後の安定化を待つ。
    drain_batches(&rx, Duration::from_secs(3));

    // sleep を入れずにバーストで書き込む（CI 負荷耐性のため）。
    // 連続 write はミリ秒未満で完了するため、Poll の 2 秒間隔を
    // 待つ間に複数 write が 1 回の Poll サイクル内で観測され、結
    // 果として 100ms ウィンドウにも収まる。
    for i in 0..15 {
        std::fs::write(&target, format!("v{i}").as_bytes()).unwrap();
    }

    // Poll は 2 秒待ってから検知するため、長めのタイムアウトを設定。
    let batches = collect_batches_for(
        &rx,
        &target,
        Duration::from_secs(10),
        Duration::from_millis(500),
    );
    assert_eq!(
        batches.len(),
        1,
        "Poll バックエンドでも連続書き込みは 1 batch に集約されるべき: got {batches:?}"
    );
    assert_eq!(
        vec![target],
        batches[0].upserted(),
        "poll backend でも upserted に 1 回だけ載るべき"
    );

    drop(watcher);
}
