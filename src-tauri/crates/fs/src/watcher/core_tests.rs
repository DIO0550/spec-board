use super::*;
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

/// `target_path` を参照する [`FsEvent`] が届くまで待つ。タイムアウト
/// に達した場合は `None` を返す。
fn wait_for_event_at(
    rx: &Receiver<FsEvent>,
    target_path: &Path,
    timeout: Duration,
) -> Option<FsEvent> {
    let deadline = Instant::now() + timeout;
    loop {
        let remaining = match deadline.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => r,
            _ => return None,
        };
        match rx.recv_timeout(remaining) {
            Ok(ev) => {
                if event_paths(&ev).iter().any(|p| p == target_path) {
                    return Some(ev);
                }
            }
            Err(_) => return None,
        }
    }
}

/// 現在バッファされているイベントを全て読み捨て、`quiet_window` の
/// 間に新規イベントが届かなくなった時点で復帰する。
fn drain_events(rx: &Receiver<FsEvent>, quiet_window: Duration) {
    loop {
        match rx.recv_timeout(quiet_window) {
            Ok(_) => continue,
            Err(_) => return,
        }
    }
}

/// チャネルが `Disconnected` を返すまでイベントを読み続け、それまで
/// に取得した全イベントを返す。Drop 後に新規イベントが届かないこと
/// を検証するテスト用ヘルパー。
///
/// `overall_deadline` を上限として、`Drop` の teardown にリグレッ
/// ションが起きた場合や notify の platform-specific な挙動でチャネ
/// ルが永続的に Disconnect しない場合にテストスイート全体がハングし
/// ないようにしている。期限内に `Disconnected` を観測できなければ
/// 明示メッセージで panic する。
fn drain_until_disconnected(
    rx: &Receiver<FsEvent>,
    per_recv_timeout: Duration,
    overall_deadline: Duration,
) -> Vec<FsEvent> {
    let mut out = Vec::new();
    let stop_at = Instant::now() + overall_deadline;
    loop {
        let remaining = match stop_at.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => r,
            _ => panic!(
                "drain_until_disconnected: channel did not Disconnect within {overall_deadline:?} \
                 (collected {n} events so far)",
                n = out.len()
            ),
        };
        let next_timeout = std::cmp::min(per_recv_timeout, remaining);
        match rx.recv_timeout(next_timeout) {
            Ok(ev) => out.push(ev),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return out,
        }
    }
}

fn event_paths(ev: &FsEvent) -> Vec<PathBuf> {
    match ev {
        FsEvent::Created(p) | FsEvent::Modified(p) | FsEvent::Removed(p) | FsEvent::Other(p) => {
            vec![p.clone()]
        }
        FsEvent::Renamed { from, to } => vec![from.clone(), to.clone()],
        FsEvent::Error(_) | FsEvent::Rescan => Vec::new(),
    }
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
/// 削除される。これにより、以前の `Box::leak` 方式（メモリと一時
/// ディレクトリを永続的にリーク）を撤廃できる。
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
            Err("poll should not be called".into())
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
            Err("new failed: inotify limit".into())
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
            Err("watch failed: too many watches".into())
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
    let result = build_backend_with(
        tx,
        &path,
        |_t, _p| Err("new failed: A".into()),
        |_t, _p| Err("io error: B".into()),
    );
    match result {
        Ok(_) => panic!("expected error when both backends fail"),
        Err(WatcherError::Init(msg)) => {
            assert!(
                msg.contains("new failed: A"),
                "missing recommended ctx: {msg}"
            );
            assert!(msg.contains("io error: B"), "missing poll ctx: {msg}");
        }
        Err(other) => panic!("expected Init, got {other:?}"),
    }
}

#[test]
fn combine_init_errors_includes_both_contexts() {
    let s = combine_init_errors("recommended X", "poll Y");
    assert!(s.contains("recommended X"));
    assert!(s.contains("poll Y"));
}

// ─────────────────────────────────────────────────────────────────
// アダプタスレッド: ランタイムエラー伝播
// ─────────────────────────────────────────────────────────────────

#[test]
fn spawn_adapter_translates_runtime_error_into_fsevent_error() {
    let (tx, rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(rx);

    let nerr = notify::Error::generic("backend exploded");
    tx.send(Err(nerr)).unwrap();

    let received = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("should receive an error event");
    match received {
        FsEvent::Error(msg) => assert!(
            msg.contains("backend exploded"),
            "error message must include the source: {msg}"
        ),
        other => panic!("expected FsEvent::Error, got {other:?}"),
    }

    drop(tx);
    let _ = handle.join();
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

    let ev = wait_for_event_at(&rx, &target, Duration::from_secs(5))
        .expect("should observe an event for the new file");
    assert!(
        event_paths(&ev).iter().any(|p| p == &target),
        "received event must reference the target path: {ev:?}"
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

    let ev = wait_for_event_at(&rx, &target, Duration::from_secs(5))
        .expect("should observe an event for nested file");
    assert!(
        event_paths(&ev).iter().any(|p| p == &target),
        "received event must reference the nested path: {ev:?}"
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
    let ev = wait_for_event_at(&rx, &target, Duration::from_secs(8))
        .expect("poll backend should eventually observe the file");
    assert!(
        event_paths(&ev).iter().any(|p| p == &target),
        "poll event must reference target: {ev:?}"
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
    let _ = wait_for_event_at(&rx, &warmup, Duration::from_secs(5));

    // ウォームアップで発生した残イベントを読み捨てる。
    drain_events(&rx, Duration::from_millis(200));

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
        .any(|ev| event_paths(ev).iter().any(|p| p == &marker));
    assert!(
        !any_marker,
        "no event referencing {marker_name} should appear after Drop; got {queued:?}"
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
// 純粋ロジック: DEBOUNCE_DURATION / event_path / enqueue_pending /
// drain_due / next_wait
// ─────────────────────────────────────────────────────────────────

#[test]
fn debounce_duration_constant_is_100ms() {
    assert_eq!(DEBOUNCE_DURATION, Duration::from_millis(100));
}

#[test]
fn event_path_returns_some_for_created_modified_removed_other() {
    let p = PathBuf::from("/tmp/x");
    assert_eq!(event_path(&FsEvent::Created(p.clone())), Some(p.clone()));
    assert_eq!(event_path(&FsEvent::Modified(p.clone())), Some(p.clone()));
    assert_eq!(event_path(&FsEvent::Removed(p.clone())), Some(p.clone()));
    assert_eq!(event_path(&FsEvent::Other(p.clone())), Some(p));
}

#[test]
fn event_path_returns_destination_for_renamed() {
    let from = PathBuf::from("/tmp/a");
    let to = PathBuf::from("/tmp/b");
    let ev = FsEvent::Renamed {
        from: from.clone(),
        to: to.clone(),
    };
    assert_eq!(
        event_path(&ev),
        Some(to),
        "Renamed の集約キーは宛先 `to` であるべき"
    );
}

#[test]
fn event_path_returns_none_for_rescan_and_error() {
    assert_eq!(event_path(&FsEvent::Rescan), None);
    assert_eq!(event_path(&FsEvent::Error("boom".into())), None);
}

#[test]
fn enqueue_pending_inserts_new_entry_with_deadline_now_plus_window() {
    let mut pending: PendingMap = HashMap::new();
    let now = Instant::now();
    let path = PathBuf::from("/tmp/a");
    enqueue_pending(
        &mut pending,
        path.clone(),
        FsEvent::Modified(path.clone()),
        now,
    );

    let entry = pending.get(&path).expect("entry should be inserted");
    assert_eq!(entry.deadline, now + DEBOUNCE_DURATION);
    assert_eq!(entry.event, FsEvent::Modified(path));
}

#[test]
fn enqueue_pending_overwrites_event_when_same_path_arrives() {
    let mut pending: PendingMap = HashMap::new();
    let now = Instant::now();
    let path = PathBuf::from("/tmp/a");
    enqueue_pending(
        &mut pending,
        path.clone(),
        FsEvent::Created(path.clone()),
        now,
    );
    enqueue_pending(
        &mut pending,
        path.clone(),
        FsEvent::Modified(path.clone()),
        now,
    );

    let entry = pending.get(&path).unwrap();
    assert_eq!(
        entry.event,
        FsEvent::Modified(path),
        "後続イベントが先のイベントを上書きすべき"
    );
}

#[test]
fn enqueue_pending_slides_deadline_on_subsequent_event() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let t1 = t0 + Duration::from_millis(50);
    let path = PathBuf::from("/tmp/a");

    enqueue_pending(
        &mut pending,
        path.clone(),
        FsEvent::Modified(path.clone()),
        t0,
    );
    let first_deadline = pending[&path].deadline;
    assert_eq!(first_deadline, t0 + DEBOUNCE_DURATION);

    enqueue_pending(
        &mut pending,
        path.clone(),
        FsEvent::Modified(path.clone()),
        t1,
    );
    let second_deadline = pending[&path].deadline;
    assert_eq!(
        second_deadline,
        t1 + DEBOUNCE_DURATION,
        "deadline は最新イベント到着時刻を起点にスライドすべき"
    );
    assert!(second_deadline > first_deadline);
}

#[cfg(debug_assertions)]
#[test]
#[should_panic]
fn enqueue_pending_panics_in_debug_when_called_with_rescan() {
    let mut pending: PendingMap = HashMap::new();
    enqueue_pending(
        &mut pending,
        PathBuf::from("/tmp/a"),
        FsEvent::Rescan,
        Instant::now(),
    );
}

#[test]
fn next_wait_returns_none_when_pending_is_empty() {
    let pending: PendingMap = HashMap::new();
    assert_eq!(next_wait(&pending, Instant::now()), None);
}

#[test]
fn next_wait_returns_remaining_for_nearest_deadline() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let near = PathBuf::from("/tmp/near");
    let far = PathBuf::from("/tmp/far");
    pending.insert(
        near.clone(),
        PendingEvent {
            event: FsEvent::Modified(near),
            deadline: t0 + Duration::from_millis(30),
        },
    );
    pending.insert(
        far.clone(),
        PendingEvent {
            event: FsEvent::Modified(far),
            deadline: t0 + Duration::from_millis(80),
        },
    );

    let remaining = next_wait(&pending, t0).expect("nonempty pending should have a wait");
    assert_eq!(
        remaining,
        Duration::from_millis(30),
        "最も近い deadline までの残時間を返すべき"
    );
}

#[test]
fn next_wait_saturates_to_zero_when_deadline_already_passed() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let p = PathBuf::from("/tmp/a");
    pending.insert(
        p.clone(),
        PendingEvent {
            event: FsEvent::Modified(p),
            deadline: t0,
        },
    );
    let later = t0 + Duration::from_millis(20);
    assert_eq!(next_wait(&pending, later), Some(Duration::ZERO));
}

#[test]
fn drain_due_returns_empty_when_nothing_expired() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let p = PathBuf::from("/tmp/a");
    pending.insert(
        p.clone(),
        PendingEvent {
            event: FsEvent::Modified(p),
            deadline: t0 + Duration::from_millis(50),
        },
    );
    let due = drain_due(&mut pending, t0);
    assert!(due.is_empty());
    assert_eq!(pending.len(), 1, "未期限のエントリは残るべき");
}

#[test]
fn drain_due_returns_only_expired_entries() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let expired = PathBuf::from("/tmp/expired");
    let alive = PathBuf::from("/tmp/alive");
    pending.insert(
        expired.clone(),
        PendingEvent {
            event: FsEvent::Modified(expired.clone()),
            deadline: t0,
        },
    );
    pending.insert(
        alive.clone(),
        PendingEvent {
            event: FsEvent::Modified(alive.clone()),
            deadline: t0 + Duration::from_millis(100),
        },
    );

    let due = drain_due(&mut pending, t0 + Duration::from_millis(10));
    assert_eq!(due, vec![FsEvent::Modified(expired.clone())]);
    assert!(
        !pending.contains_key(&expired),
        "期限切れエントリは pending から除去されるべき"
    );
    assert!(
        pending.contains_key(&alive),
        "未期限エントリは pending に残るべき"
    );
}

#[test]
fn drain_due_at_exact_deadline_includes_entry() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let p = PathBuf::from("/tmp/a");
    pending.insert(
        p.clone(),
        PendingEvent {
            event: FsEvent::Modified(p.clone()),
            deadline: t0,
        },
    );
    let due = drain_due(&mut pending, t0);
    assert_eq!(due, vec![FsEvent::Modified(p)], "deadline == now は対象");
}

#[test]
fn drain_due_returns_results_in_deterministic_order() {
    let mut pending: PendingMap = HashMap::new();
    let t0 = Instant::now();
    let same_deadline = t0;
    let pa = PathBuf::from("/tmp/a");
    let pb = PathBuf::from("/tmp/b");
    let pc = PathBuf::from("/tmp/c");
    for p in [&pc, &pa, &pb] {
        pending.insert(
            p.clone(),
            PendingEvent {
                event: FsEvent::Modified(p.clone()),
                deadline: same_deadline,
            },
        );
    }
    let due = drain_due(&mut pending, t0);
    assert_eq!(
        due,
        vec![
            FsEvent::Modified(pa),
            FsEvent::Modified(pb),
            FsEvent::Modified(pc),
        ],
        "同点 deadline は path 昇順で並ぶべき（決定論性）"
    );
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
fn spawn_adapter_emits_single_event_after_debounce_window() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_single");

    notify_tx.send(Ok(modify_event(&path))).unwrap();

    // 「ウィンドウ満了前は届かない」を short timeout で検証すると、
    // CI 負荷でテストスレッドが 100ms 以上スケジュールされない場合
    // にイベントが既に到着していて偽陽性になり得るため、ここでは
    // 件数ベースの検証だけ行う:「最終的にちょうど 1 件、Modified
    // が届くこと」「以降に余分なイベントは続かないこと」。
    let ev = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("debounce 満了後にイベントが届くべき");
    assert_eq!(ev, FsEvent::Modified(path));

    // 余分なイベントが続かないこと（debounce が 1 件に集約している）。
    assert!(
        matches!(
            fs_rx.recv_timeout(Duration::from_millis(300)),
            Err(RecvTimeoutError::Timeout)
        ),
        "1 回投入につき発火は 1 件のみであるべき"
    );

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_slides_deadline_when_same_path_arrives_within_window() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_slide");

    // 同一 path に 2 回連続投入。間に短い sleep を挟むのは「2 回目を
    // 1 回目の debounce window 内に入れる」ためだが、CI 負荷で sleep
    // が 100ms+ にブレた場合でも sliding 集約の最終結果（投入 N 回 →
    // 発火 1 件）は変わらないため、sleep + try_recv による「まだ届い
    // ていない」アサーションは行わず、件数のみで検証する。
    notify_tx.send(Ok(modify_event(&path))).unwrap();
    std::thread::sleep(Duration::from_millis(50));
    notify_tx.send(Ok(modify_event(&path))).unwrap();

    let ev = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("debounce 満了後に 1 件届くべき");
    assert_eq!(ev, FsEvent::Modified(path));

    // 余分なイベントが続かないこと（sliding 集約が機能している）。
    assert!(
        matches!(
            fs_rx.recv_timeout(Duration::from_millis(300)),
            Err(RecvTimeoutError::Timeout)
        ),
        "sliding 集約により 2 回投入でも発火は 1 件のみであるべき"
    );

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_flushes_pending_on_notify_tx_drop() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_flush");

    notify_tx.send(Ok(modify_event(&path))).unwrap();
    // ウィンドウ満了前に上流を drop する。
    std::thread::sleep(Duration::from_millis(30));
    drop(notify_tx);

    // flush で保留イベントが届く。
    let ev = fs_rx
        .recv_timeout(Duration::from_millis(500))
        .expect("Drop 時に保留イベントが flush されるべき");
    assert_eq!(ev, FsEvent::Modified(path));

    // その後は Disconnected。
    let next = fs_rx.recv_timeout(Duration::from_millis(500));
    assert!(
        matches!(next, Err(RecvTimeoutError::Disconnected)),
        "flush 後はチャネルが切断されるべき: got {next:?}"
    );

    let _ = handle.join();
}

#[test]
fn spawn_adapter_forwards_rescan_immediately_bypassing_pending_events() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let path = PathBuf::from("/tmp/test_rescan_bypass");

    // Modified を投入して pending 入りさせ、20ms 後に Rescan を投入する。
    // 保留 Modified は DEBOUNCE_DURATION (100ms) 経過後に発火する仕様。
    notify_tx.send(Ok(modify_event(&path))).unwrap();
    std::thread::sleep(Duration::from_millis(20));
    notify_tx.send(Ok(ev_rescan())).unwrap();

    // 絶対時間ではなく **順序** で bypass 仕様を検証する。CI 負荷時の
    // スレッドスケジューリング遅延に耐性を持たせるため、両 recv に
    // 寛大なタイムアウトを設定する。Modified は debounce 窓に gate
    // されるため、Rescan が先に届くことが bypass の十分条件となる。
    let first = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("Rescan が先に届くべき（保留を追い越す）");
    let second = fs_rx
        .recv_timeout(Duration::from_secs(2))
        .expect("保留 Modified は Rescan の後に発火すべき（破棄されない）");

    assert_eq!(
        first,
        FsEvent::Rescan,
        "Rescan は保留 Modified を追い越して先に届くべき（Modified は DEBOUNCE_DURATION で gate される）"
    );
    assert_eq!(second, FsEvent::Modified(path));

    drop(notify_tx);
    let _ = handle.join();
}

#[test]
fn spawn_adapter_overwrites_renamed_entry_when_modified_arrives_for_same_to_path() {
    let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
    let (fs_rx, handle) = spawn_adapter(notify_rx);
    let from = PathBuf::from("/tmp/test_rename_from");
    let to = PathBuf::from("/tmp/test_rename_to");

    notify_tx.send(Ok(rename_both_event(&from, &to))).unwrap();
    std::thread::sleep(Duration::from_millis(50));
    notify_tx.send(Ok(modify_event(&to))).unwrap();

    // 2 回目から 100ms 以上待って 1 件のみ届く。
    let ev = fs_rx
        .recv_timeout(Duration::from_millis(500))
        .expect("最後のイベントが届くべき");
    assert_eq!(
        ev,
        FsEvent::Modified(to),
        "Renamed は同じ to path への後続 Modified に上書きされるべき"
    );

    // 余分なイベントが続かないことを確認。
    assert!(
        matches!(
            fs_rx.recv_timeout(Duration::from_millis(150)),
            Err(RecvTimeoutError::Timeout)
        ),
        "上書き後は 1 件のみ届くべき"
    );

    drop(notify_tx);
    let _ = handle.join();
}

// ─────────────────────────────────────────────────────────────────
// 統合テスト: 実 FS でデバウンス挙動を確認
// ─────────────────────────────────────────────────────────────────

/// 指定 path に対する `FsEvent`（Modified / Created / Other など）を
/// 1 件以上収集する。バックエンドが Created を発火するか Modified を
/// 発火するか、または両方を返すかは OS / バックエンド依存のため、
/// デバウンス効果（イベント件数の縮減）に焦点を当てて集計する。
fn collect_events_for(
    rx: &Receiver<FsEvent>,
    target: &Path,
    overall: Duration,
    quiet: Duration,
) -> Vec<FsEvent> {
    let mut out = Vec::new();
    let stop = Instant::now() + overall;
    loop {
        let remaining = match stop.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => std::cmp::min(r, quiet),
            _ => break,
        };
        match rx.recv_timeout(remaining) {
            Ok(ev) => {
                if event_paths(&ev).iter().any(|p| p == target) {
                    out.push(ev);
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
    drain_events(&rx, Duration::from_millis(300));

    // sleep を入れずにバーストで書き込む。CI 負荷で sleep が伸びる
    // と「100ms 内」の前提が崩れるため、回数を増やしつつ間隔は OS
    // スレッドのスケジュール粒度に任せる。
    for i in 0..20 {
        std::fs::write(&target, format!("v{i}").as_bytes()).unwrap();
    }

    // E2E sanity check: debounce が「大幅にイベントを集約している」
    // ことのみ検証する。kernel の inotify イベント配信が CI 負荷で
    // 100ms ウィンドウを跨ぐ場合に 2 件以上に分かれることはあり得
    // るため、strict `== 1` ではなく許容範囲（≥1 かつ ≤3）で判定
    // する。debounce が機能していなければ kernel が返す件数（数件
    // 〜十数件）がそのまま届くため、≤3 で十分に集約効果を検出で
    // きる。strict な sliding 仕様の検証は adapter-level の決定論
    // テスト（spawn_adapter_*）で担保している。
    let events = collect_events_for(
        &rx,
        &target,
        Duration::from_secs(5),
        Duration::from_millis(400),
    );
    assert!(
        !events.is_empty() && events.len() <= 3,
        "20 連続書き込みは debounce で ≤3 件に集約されるべき: got {} 件 {events:?}",
        events.len()
    );

    drop(watcher);
}

#[test]
fn watcher_emits_separate_events_when_writes_are_spaced_beyond_window() {
    let dir = TempDir::new().unwrap();
    let target = dir.path().join("spaced.md");
    std::fs::write(&target, b"init").unwrap();
    let (watcher, rx) = Watcher::start(dir.path()).expect("start should succeed");
    drain_events(&rx, Duration::from_millis(300));

    std::fs::write(&target, b"v1").unwrap();
    std::thread::sleep(Duration::from_millis(250));
    std::fs::write(&target, b"v2").unwrap();

    let events = collect_events_for(
        &rx,
        &target,
        Duration::from_secs(5),
        Duration::from_millis(400),
    );
    assert_eq!(
        events.len(),
        2,
        "250ms 間隔の 2 回書き込みは別イベントとして発火するべき: got {events:?}"
    );

    drop(watcher);
}

/// `quiet` の間に新規イベントが届かなくなるか `overall` が経過する
/// まで全イベントを収集する。`collect_events_for` と異なり target に
/// よるフィルタリングを行わず、複数 target に対する独立性を検証する
/// テストで使う。
fn collect_all_events(rx: &Receiver<FsEvent>, overall: Duration, quiet: Duration) -> Vec<FsEvent> {
    let mut out = Vec::new();
    let stop = Instant::now() + overall;
    loop {
        let remaining = match stop.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => std::cmp::min(r, quiet),
            _ => break,
        };
        match rx.recv_timeout(remaining) {
            Ok(ev) => out.push(ev),
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
    drain_events(&rx, Duration::from_millis(300));

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
    let all = collect_all_events(&rx, Duration::from_secs(5), Duration::from_millis(400));
    let events_a: Vec<_> = all
        .iter()
        .filter(|ev| event_paths(ev).iter().any(|p| p == &a))
        .collect();
    let events_b: Vec<_> = all
        .iter()
        .filter(|ev| event_paths(ev).iter().any(|p| p == &b))
        .collect();
    assert!(
        !events_a.is_empty() && events_a.len() <= 3,
        "ファイル a の連続書き込みは ≤3 件に集約: got {} 件 {events_a:?} (all={all:?})",
        events_a.len()
    );
    assert!(
        !events_b.is_empty() && events_b.len() <= 3,
        "ファイル b の連続書き込みは ≤3 件に集約: got {} 件 {events_b:?} (all={all:?})",
        events_b.len()
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
    drain_events(&rx, Duration::from_secs(3));

    // sleep を入れずにバーストで書き込む（CI 負荷耐性のため）。
    // 連続 write はミリ秒未満で完了するため、Poll の 2 秒間隔を
    // 待つ間に複数 write が 1 回の Poll サイクル内で観測され、結
    // 果として 100ms ウィンドウにも収まる。
    for i in 0..15 {
        std::fs::write(&target, format!("v{i}").as_bytes()).unwrap();
    }

    // Poll は 2 秒待ってから検知するため、長めのタイムアウトを設定。
    let events = collect_events_for(
        &rx,
        &target,
        Duration::from_secs(10),
        Duration::from_millis(500),
    );
    assert_eq!(
        events.len(),
        1,
        "Poll バックエンドでも連続書き込みは 1 件に集約されるべき: got {events:?}"
    );

    drop(watcher);
}
