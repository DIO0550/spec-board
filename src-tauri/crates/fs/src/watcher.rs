//! `notify` クレートの上に構築する再帰ファイルシステムウォッチャ。
//!
//! 公開 API では `notify::*` の型を一切露出させず、呼び出し側は `std` の型
//! と本モジュールが定義する [`FsEvent`] / [`WatcherError`] にのみ依存する。
//! バックエンドは自動選択: まず `RecommendedWatcher` を試み、初期化または
//! 再帰 `watch()` のいずれかが失敗した場合は `PollWatcher`（2 秒間隔）に
//! フォールバックする。
//!
//! 停止は `Drop` を介して同期的に行う: 先にバックエンドを解放し、続いて
//! アダプタスレッドを join する。`Drop` から復帰した後に発生したファイル
//! 変更はイベント化されないが、Drop 前にアダプタが enqueue 済みのイベン
//! トは `Disconnected` が観測されるまで receiver から取り出せる。

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use notify::event::{EventKind, ModifyKind};
use notify::{
    Config as NotifyConfig, Event as NotifyEvent, EventHandler, PollWatcher, RecommendedWatcher,
    RecursiveMode, Watcher as NotifyWatcher,
};
use thiserror::Error;

const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// 呼び出し側に渡すファイルシステムイベント。
///
/// `notify::Event` のペイロードを以下のいずれかの variant に変換する。
/// rename は `notify::Event` が source と destination の両方のパスを持つ
/// 場合のみ単一の [`FsEvent::Renamed`] として発火し、それ以外は先頭パスで
/// [`FsEvent::Other`] に降格する。
/// `notify` バックエンドからのランタイムエラーは黙殺せず [`FsEvent::Error`]
/// として通知する。バックエンドが `notify::Event::need_rescan()` でキュー
/// オーバーフロー / イベントコアレスを報告した場合は [`FsEvent::Rescan`]
/// を発火し、呼び出し側がファイルシステムと永続的に乖離しないよう状態を
/// 再構築できるようにする。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FsEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
    Renamed {
        from: PathBuf,
        to: PathBuf,
    },
    Other(PathBuf),
    Error(String),
    /// バックエンドが過去のイベントを取りこぼした可能性がある旨を通知した
    /// ことを示す（キューオーバーフロー / コアレス）。呼び出し側は状態の
    /// 再スキャン / 再構築を行う必要がある。
    Rescan,
}

/// [`Watcher::start`] が返すエラー。
#[derive(Debug, Error)]
pub enum WatcherError {
    #[error("failed to initialize file system watcher: {0}")]
    Init(String),
    #[error("watch path does not exist or is not a directory: `{}`", .0.display())]
    PathNotFound(PathBuf),
    #[error("io error while preparing watcher: {0}")]
    Io(#[from] std::io::Error),
}

/// 背後の `notify` ウォッチャを保持し、[`Watcher`] が生きている間 OS レベ
/// ルの監視スレッドを存続させるバックエンド variant。内側の値が直接読まれ
/// ることはない — drop されたタイミングで OS レベルの監視を解放するため
/// に保持しているだけである。
pub(crate) enum Backend {
    Recommended(#[allow(dead_code)] RecommendedWatcher),
    Poll(#[allow(dead_code)] PollWatcher),
}

/// 再帰ファイルシステムウォッチャ。値を drop すると同期的に監視を停止す
/// る: 先に OS レベルのバックエンドを解放し、続いてアダプタスレッドを
/// join する。`Drop` が復帰した **後** に発生したファイル変更は receiver
/// に届かない。Drop 前にアダプタが enqueue 済みのイベントは receiver が
/// `Disconnected` を観測するまで取り出せる。
pub struct Watcher {
    backend: Option<Backend>,
    adapter_handle: Option<JoinHandle<()>>,
}

impl Watcher {
    /// `path` を再帰的に監視し、変換済み [`FsEvent`] を流す receiver と
    /// ウォッチャ本体を返す。
    ///
    /// まず `RecommendedWatcher` を試し、`new` または `watch` のいずれか
    /// が失敗した場合（例: Linux の inotify 上限超過）に `PollWatcher`
    /// （2 秒間隔）へフォールバックする。
    ///
    /// # Errors
    ///
    /// - [`WatcherError::PathNotFound`]: `path` が存在しない、または
    ///   ディレクトリでない場合
    /// - [`WatcherError::Io`]: metadata 取得時の I/O 失敗
    /// - [`WatcherError::Init`]: recommended / poll の両バックエンドが
    ///   初期化または再帰監視開始に失敗した場合。エラーメッセージには
    ///   両バックエンドの原因が含まれる
    pub fn start(path: impl AsRef<Path>) -> Result<(Self, Receiver<FsEvent>), WatcherError> {
        let path = path.as_ref();
        validate_path(path)?;

        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend = build_backend(notify_tx, path)?;
        let (fs_rx, handle) = spawn_adapter(notify_rx);

        Ok((
            Self {
                backend: Some(backend),
                adapter_handle: Some(handle),
            },
            fs_rx,
        ))
    }

    /// 強制的に [`PollWatcher`] バックエンドを使うテスト専用のエントリポ
    /// イント。Linux の CI では inotify の初期化が常に成功するため、本関
    /// 数を経由してフォールバック経路をカバレッジ計測の対象にできる。
    ///
    /// # Errors
    ///
    /// - [`WatcherError::PathNotFound`]: `path` が存在しない、または
    ///   ディレクトリでない場合
    /// - [`WatcherError::Io`]: metadata 取得時の I/O 失敗
    /// - [`WatcherError::Init`]: poll バックエンドの初期化または再帰監視
    ///   開始に失敗した場合
    #[cfg(test)]
    pub(crate) fn start_with_poll(
        path: impl AsRef<Path>,
    ) -> Result<(Self, Receiver<FsEvent>), WatcherError> {
        let path = path.as_ref();
        validate_path(path)?;

        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend = build_poll_backend(notify_tx, path)
            .map_err(|e| WatcherError::Init(format!("poll backend failed: {e}")))?;
        let (fs_rx, handle) = spawn_adapter(notify_rx);

        Ok((
            Self {
                backend: Some(backend),
                adapter_handle: Some(handle),
            },
            fs_rx,
        ))
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        // 先にバックエンドを drop する。これにより notify 内部の OS
        // スレッドが停止し、イベントハンドラクロージャが保持していた
        // Sender clone が解放される。`notify_tx` への全 Sender が消えた
        // 時点でアダプタスレッドの `recv()` が Err を返し loop を抜ける。
        self.backend.take();

        // アダプタスレッドを join して呼び出し側に「同期停止が完了し
        // た」状態を保証する。`drop` 復帰後は新規ファイル変更が
        // FsEvent 化されることはない。enqueue 済みイベントは `fs_rx`
        // が `Disconnected` を観測するまで取り出せる。
        if let Some(handle) = self.adapter_handle.take() {
            let _ = handle.join();
        }
    }
}

/// `path` が存在し、かつディレクトリであることを確認する。
///
/// 存在確認とディレクトリ判定を単一の `metadata()` 呼び出しで行うことで、
/// 二段呼び出し中にディレクトリが削除されるような TOCTOU レースが
/// [`WatcherError::Io`] に降格せず [`WatcherError::PathNotFound`] にマップ
/// されるようにしている。symlink ディレクトリは許容する（再帰中に出現す
/// る子孫 symlink を辿らないポリシーは [`notify_config`] が担保する）。
fn validate_path(path: &Path) -> Result<(), WatcherError> {
    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => Ok(()),
        Ok(_) => Err(WatcherError::PathNotFound(path.to_path_buf())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(WatcherError::PathNotFound(path.to_path_buf()))
        }
        Err(e) => Err(WatcherError::Io(e)),
    }
}

/// 本物のバックエンドコンストラクタを [`build_backend_with`] に流し込む
/// だけの薄いラッパ。フォールバックポリシー本体を OS リソース非依存で
/// 直接単体テストできるよう、shim としてこの関数だけ分離している。
fn build_backend(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, WatcherError> {
    build_backend_with(tx, path, try_build_recommended, build_poll_backend)
}

/// 使用するバックエンドを決定する。コンストラクタを引数として注入できる
/// ため、フォールバックポリシー（recommended が `new` または `watch` に
/// 失敗 → poll に切り替え）を本物のウォッチャ無しで決定的に単体テストで
/// きる。
pub(crate) fn build_backend_with<R, P>(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
    try_recommended: R,
    try_poll: P,
) -> Result<Backend, WatcherError>
where
    R: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> Result<Backend, String>,
    P: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> Result<Backend, String>,
{
    let recommended_err = match try_recommended(tx.clone(), path) {
        Ok(backend) => return Ok(backend),
        Err(e) => e,
    };
    match try_poll(tx, path) {
        Ok(backend) => Ok(backend),
        Err(poll_err) => Err(WatcherError::Init(combine_init_errors(
            &recommended_err,
            &poll_err,
        ))),
    }
}

/// recommended と poll の両バックエンド初期化が失敗した場合に返す結合
/// エラーメッセージを組み立てる純粋関数。フォーマットを単体テストで固定
/// できるよう（OS 依存無し）に分離してある。
pub(crate) fn combine_init_errors(recommended: &str, poll: &str) -> String {
    format!("recommended watcher failed: {recommended}; poll watcher failed: {poll}")
}

fn try_build_recommended(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, String> {
    let mut w =
        RecommendedWatcher::new(forward_handler(tx), notify_config()).map_err(|e| e.to_string())?;
    w.watch(path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(Backend::Recommended(w))
}

fn build_poll_backend(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> Result<Backend, String> {
    let config = notify_config().with_poll_interval(POLL_INTERVAL);
    let mut w = PollWatcher::new(forward_handler(tx), config).map_err(|e| e.to_string())?;
    w.watch(path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(Backend::Poll(w))
}

/// 共通の `notify::Config`: 再帰走査中の symlink は辿らない設定。無限
/// ループとプロジェクト境界外の監視を防止する。
fn notify_config() -> NotifyConfig {
    NotifyConfig::default().with_follow_symlinks(false)
}

/// `notify` の結果をアダプタスレッドに転送するクロージャを生成する。
/// アダプタが既に終了している場合は receiver が無いため、配送先が無い
/// ものとしてメッセージを黙って破棄する。
fn forward_handler(tx: Sender<notify::Result<NotifyEvent>>) -> impl EventHandler {
    move |res: notify::Result<NotifyEvent>| {
        let _ = tx.send(res);
    }
}

/// `notify::Result<Event>` を [`FsEvent`] に変換して、呼び出し側向けの
/// チャネルへ転送するアダプタスレッドを spawn する。loop は上流の
/// sender が drop された（バックエンドが解放された）か、下流の receiver
/// が drop された（呼び出し側が受信をやめた）時点で終了する。
fn spawn_adapter(
    notify_rx: Receiver<notify::Result<NotifyEvent>>,
) -> (Receiver<FsEvent>, JoinHandle<()>) {
    let (fs_tx, fs_rx) = mpsc::channel::<FsEvent>();
    let handle = thread::spawn(move || {
        while let Ok(item) = notify_rx.recv() {
            let translated = match item {
                Ok(ev) => convert_event(ev),
                Err(e) => Some(vec![FsEvent::Error(e.to_string())]),
            };
            let Some(events) = translated else { continue };
            for fs_ev in events {
                if fs_tx.send(fs_ev).is_err() {
                    return;
                }
            }
        }
    });
    (fs_rx, handle)
}

/// 単一の `notify::Event` を 0 件以上の [`FsEvent`] に変換する。
///
/// パターンマッチの順序が重要: `Modify(Name(_))` の source / destination
/// 両方のパスを伴うケースは、汎用 `Modify(_)` アームより先にマッチさせ
/// る必要がある。そうしないと rename が [`FsEvent::Modified`] に降格して
/// しまい、本来の [`FsEvent::Renamed`] として発火されない。
fn convert_event(ev: NotifyEvent) -> Option<Vec<FsEvent>> {
    // Rescan フラグは empty-paths のガードより先に判定する必要がある。
    // notify はキューオーバーフロー / コアレスを具体的なパス無しで通知
    // することがあり、これを破棄すると呼び出し側が永続的に状態乖離する。
    if ev.need_rescan() {
        return Some(vec![FsEvent::Rescan]);
    }
    if ev.paths.is_empty() {
        return None;
    }
    let first = ev.paths[0].clone();
    let translated = match ev.kind {
        EventKind::Create(_) => vec![FsEvent::Created(first)],
        EventKind::Remove(_) => vec![FsEvent::Removed(first)],
        EventKind::Modify(ModifyKind::Name(_)) if ev.paths.len() >= 2 => {
            vec![FsEvent::Renamed {
                from: ev.paths[0].clone(),
                to: ev.paths[1].clone(),
            }]
        }
        // 両端点が揃わない rename は rename として扱えない。内容変更と
        // して扱うと誤解を招くため、呼び出し側が判断できるよう `Other`
        // に降格する。
        EventKind::Modify(ModifyKind::Name(_)) => vec![FsEvent::Other(first)],
        EventKind::Modify(_) => vec![FsEvent::Modified(first)],
        _ => vec![FsEvent::Other(first)],
    };
    Some(translated)
}

#[cfg(test)]
mod tests {
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
            FsEvent::Created(p)
            | FsEvent::Modified(p)
            | FsEvent::Removed(p)
            | FsEvent::Other(p) => vec![p.clone()],
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
        let backend =
            build_poll_backend(tx, dir.path()).expect("poll backend should build for tests");
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
        let (watcher, rx) =
            Watcher::start_with_poll(dir.path()).expect("poll start should succeed");

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

        let queued =
            drain_until_disconnected(&rx, Duration::from_millis(300), Duration::from_secs(10));

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

        let (watcher, _rx) =
            Watcher::start(&link).expect("symlink directory root should be accepted");
        drop(watcher);
    }
}
