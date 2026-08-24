//! `notify` クレートの上に構築する再帰ファイルシステムウォッチャ。
//!
//! 公開 API では `notify::*` の型を一切露出させず、呼び出し側は `std` の型
//! と [`FileChangeBatch`] / [`WatcherError`] にのみ依存する。デバウンス
//! ウィンドウ内の変更は path ごとの最終状態へ畳み込まれ、1 つの
//! [`FileChangeBatch`] として送出される。
//! バックエンドは自動選択: まず `RecommendedWatcher` を試み、初期化または
//! 再帰 `watch()` のいずれかが失敗した場合は `PollWatcher`（2 秒間隔）に
//! フォールバックする。
//!
//! 停止は `Drop` を介して同期的に行う: 先にバックエンドを解放し、続いて
//! アダプタスレッドを join する。`Drop` から復帰した後に発生したファイル
//! 変更はイベント化されないが、Drop 前にアダプタが enqueue 済みの batch
//! は `Disconnected` が観測されるまで receiver から取り出せる。

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::event::{EventKind, ModifyKind};
use notify::{
    Config as NotifyConfig, Event as NotifyEvent, EventHandler, PollWatcher, RecommendedWatcher,
    RecursiveMode, Watcher as NotifyWatcher,
};
use thiserror::Error;

use super::file_change_batch::{FileChangeBatch, PendingChanges};

/// `PollWatcher` フォールバック時にファイルシステムを走査する間隔。
///
/// ネイティブ監視が使えない環境では一定間隔でディレクトリを総当たり走査する
/// ため、間隔を短くすると変更の検知は速くなるが走査回数が増えて CPU / I/O
/// 負荷が上がり、長くすると負荷は下がるが検知が遅れる。2 秒はこのトレードオフ
/// の中で、ユーザが体感する反映遅延を許容範囲に保ちつつ常駐コストを抑える
/// 妥協点として選んでいる。
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// 同一パスの連続イベントを集約するスライディングウィンドウ幅。
///
/// 新しいイベントが到来するたびに deadline は `now + DEBOUNCE_DURATION`
/// まで延長され、`DEBOUNCE_DURATION` 静止して初めて発火する。
///
/// 100ms は、エディタが保存時に行う「一時ファイル書き込み → rename →
/// メタデータ更新」のような短時間に連続して飛んでくる write を 1 イベントに
/// まとめて吸収できる程度の幅でありつつ、人間が「変更したのに反映されない」
/// と感じない短さに収まる値として選んでいる。短すぎると 1 回の保存が複数
/// イベントに割れ、長すぎると反映遅延として体感される。
pub(crate) const DEBOUNCE_DURATION: Duration = Duration::from_millis(100);

/// `notify::Event` の翻訳結果を表す **watcher モジュール内部の中間表現**。
///
/// 公開 API には出さない。呼び出し側が受け取るのは、これを畳み込んだ
/// [`FileChangeBatch`] だけである。
///
/// rename は `notify::Event` が source と destination の両方のパスを持つ
/// 場合のみ単一の [`FsEvent::Renamed`] として発火し、それ以外は先頭パスで
/// [`FsEvent::Other`] に降格する。
/// `notify` バックエンドからのランタイムエラーは黙殺せず [`FsEvent::Error`]
/// として通知する。バックエンドが `notify::Event::need_rescan()` でキュー
/// オーバーフロー / イベントコアレスを報告した場合は [`FsEvent::Rescan`]
/// を発火し、呼び出し側がファイルシステムと永続的に乖離しないよう状態を
/// 再構築できるようにする。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FsEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
    Renamed {
        from: PathBuf,
        to: PathBuf,
    },
    Other(PathBuf),
    Error(WatcherFailure),
    /// バックエンドが過去のイベントを取りこぼした可能性がある旨を通知した
    /// ことを示す（キューオーバーフロー / コアレス）。呼び出し側は状態の
    /// 再スキャン / 再構築を行う必要がある。
    Rescan,
}

/// watcher バックエンドの起動時または稼働中の障害記述子。
///
/// 上位層が障害種別で分岐できるよう、文字列ではなく機械可読な `kind` を持つ。
/// 上位で文字列パースを強いる設計は、backend のメッセージ変更で静かに壊れる。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatcherFailure {
    /// 上位層（FE 通知）が分類に使う機械可読な種別。
    pub kind: WatcherFailureKind,
    /// 障害に関連するパス（backend が提示しない場合は空）。
    pub paths: Vec<PathBuf>,
    /// 人間向けの詳細。backend のメッセージをそのまま載せる。
    pub detail: String,
}

impl fmt::Display for WatcherFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.detail)
    }
}

/// [`WatcherFailure`] の種別。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherFailureKind {
    /// 監視対象ディレクトリが消えた / 到達不能になった。
    WatchPathUnavailable,
    /// OS の監視資源が枯渇した（inotify watch 上限など）。
    ResourceExhausted,
    /// 権限不足で監視を継続できない。
    PermissionDenied,
    /// 上記に当てはまらない I/O エラー。
    Io,
    /// backend 固有で分類できないエラー。
    Unknown,
}

/// [`Watcher::start`] が返す**起動時**エラー。
///
/// 稼働中のランタイム障害は [`WatcherFailure`] としてイベントストリームに流れる。
/// 両者を 1 つの型にまとめると「監視が始まらなかった」と「監視が途中で壊れた」を
/// 呼び出し側が区別できず、後者を起動失敗として扱って project を閉じてしまう。
#[derive(Debug, Error)]
pub enum WatcherError {
    #[error(
        "failed to initialize file system watcher: recommended watcher failed: {recommended}; poll watcher failed: {poll}"
    )]
    Init {
        recommended: WatcherFailure,
        poll: WatcherFailure,
    },
    #[error("watch path does not exist or is not a directory: `{}`", .0.display())]
    PathNotFound(PathBuf),
    #[error("io error while preparing watcher: {0}")]
    Io(#[from] std::io::Error),
}

/// 強制 poll 起動テスト専用のエラー。
///
/// production の [`WatcherError::Init`] は recommended と poll の両方が
/// 失敗した場合だけ生成するため、poll 単独起動の失敗を別型で表す。
#[cfg(test)]
#[derive(Debug, Error)]
pub(crate) enum PollStartError {
    #[error(transparent)]
    Validation(WatcherError),
    #[error("poll backend failed: {0}")]
    Init(WatcherFailure),
}

/// 背後の `notify` ウォッチャを保持し、[`Watcher`] が生きている間 OS レベ
/// ルの監視スレッドを存続させるバックエンド variant。内側の値が直接読まれ
/// ることはない — drop されたタイミングで OS レベルの監視を解放するため
/// に保持しているだけである。
pub(crate) enum Backend {
    Recommended(
        #[expect(
            dead_code,
            reason = "値は読まないが、drop されるまで OS レベルの監視を存続させるために所有だけする"
        )]
        RecommendedWatcher,
    ),
    Poll(
        #[expect(
            dead_code,
            reason = "値は読まないが、drop されるまで OS レベルの監視を存続させるために所有だけする"
        )]
        PollWatcher,
    ),
}

/// 再帰ファイルシステムウォッチャ。値を drop すると同期的に監視を停止す
/// る: 先に OS レベルのバックエンドを解放し、続いてアダプタスレッドを
/// join する。`Drop` が復帰した **後** に発生したファイル変更は receiver
/// に届かない。Drop 前にアダプタが保持していた保留は 1 つの
/// [`FileChangeBatch`] として flush され、receiver が `Disconnected` を
/// 観測するまで取り出せる。
pub struct Watcher {
    backend: Option<Backend>,
    adapter_handle: Option<JoinHandle<()>>,
}

impl Watcher {
    /// `path` を再帰的に監視し、畳み込み済み [`FileChangeBatch`] を流す
    /// receiver とウォッチャ本体を返す。
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
    pub fn start(
        path: impl AsRef<Path>,
    ) -> Result<(Self, Receiver<FileChangeBatch>), WatcherError> {
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
    /// - [`PollStartError::Validation`]: `path` が存在しない、または
    ///   ディレクトリでない場合
    /// - [`PollStartError::Validation`]: metadata 取得時の I/O 失敗
    /// - [`PollStartError::Init`]: poll バックエンドの初期化または再帰監視
    ///   開始に失敗した場合
    #[cfg(test)]
    pub(crate) fn start_with_poll(
        path: impl AsRef<Path>,
    ) -> Result<(Self, Receiver<FileChangeBatch>), PollStartError> {
        let path = path.as_ref();
        validate_path(path).map_err(PollStartError::Validation)?;

        let (notify_tx, notify_rx) = mpsc::channel::<notify::Result<NotifyEvent>>();
        let backend = build_poll_backend(notify_tx, path)
            .map_err(classify_notify_error)
            .map_err(PollStartError::Init)?;
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
        // た」状態を保証する。`drop` 復帰後は新規ファイル変更が batch
        // 化されることはない。flush 済みの batch は `fs_rx` が
        // `Disconnected` を観測するまで取り出せる。
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
    R: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> notify::Result<Backend>,
    P: FnOnce(Sender<notify::Result<NotifyEvent>>, &Path) -> notify::Result<Backend>,
{
    let recommended_err = match try_recommended(tx.clone(), path) {
        Ok(backend) => return Ok(backend),
        Err(e) => e,
    };
    match try_poll(tx, path) {
        Ok(backend) => Ok(backend),
        Err(poll_err) => Err(WatcherError::Init {
            recommended: classify_notify_error(recommended_err),
            poll: classify_notify_error(poll_err),
        }),
    }
}

fn try_build_recommended(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> notify::Result<Backend> {
    let mut w = RecommendedWatcher::new(forward_handler(tx), notify_config())?;
    w.watch(path, RecursiveMode::Recursive)?;
    Ok(Backend::Recommended(w))
}

fn build_poll_backend(
    tx: Sender<notify::Result<NotifyEvent>>,
    path: &Path,
) -> notify::Result<Backend> {
    let config = notify_config().with_poll_interval(POLL_INTERVAL);
    let mut w = PollWatcher::new(forward_handler(tx), config)?;
    w.watch(path, RecursiveMode::Recursive)?;
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

/// `notify::Result<Event>` を [`FileChangeBatch`] へ畳み込んで、呼び出し
/// 側向けのチャネルへ転送するアダプタスレッドを spawn する。
///
/// ウィンドウ内のイベントは [`PendingChanges`] が path ごとの最終状態へ
/// 畳み込み、[`DEBOUNCE_DURATION`] 静止した時点で 1 つの batch として
/// 送出される。`FsEvent::Rescan` / `FsEvent::Error` は畳み込み対象外で、
/// 保留を追い越して専用 batch で即時 forward する。
///
/// loop の終了条件は 2 つ:
///
/// 1. **上流の sender が drop された場合**（バックエンドが解放された）—
///    `recv_timeout` / `recv` が `Disconnected` を返した時点で検知し、
///    終了前に残保留を 1 つの batch へまとめて flush してから終了する。
/// 2. **下流の receiver が drop された場合**（呼び出し側が受信をやめた）—
///    次に `fs_tx.send` を試みた際に `Err` が返ったタイミングで検知して
///    終了する。なお、保留が空のときの `notify_rx.recv()` は無限ブロック
///    するため、上流が生きている限り fs_tx 側の drop だけでは即時に検知
///    できず、上流から次のイベントが届くまでスレッドは sleep を続ける。
///    現在の用途（`Watcher::drop` がまず上流を解放してから adapter を
///    join する）では先に 1 が成立するため、本ケースに到達するのは
///    「`Watcher` を保持したまま receiver だけ drop し、その後にイベント
///    が届く」極めて限定的な場合のみ。
fn spawn_adapter(
    notify_rx: Receiver<notify::Result<NotifyEvent>>,
) -> (Receiver<FileChangeBatch>, JoinHandle<()>) {
    let (fs_tx, fs_rx) = mpsc::channel::<FileChangeBatch>();
    let handle = thread::spawn(move || {
        let mut pending = PendingChanges::new();
        loop {
            // ループの基準時刻を 1 度だけキャプチャし、drain_due と
            // next_wait の双方に渡す。2 度 `Instant::now()` を呼ぶと、
            // その隙間で deadline が「未到来 → 到来」へ遷移したエン
            // トリが drain_due では残り、続く next_wait では `ZERO`
            // を返してしまい、`recv_timeout(0)` で受信した新着で
            // 同一 path の状態が上書きされる race が生じる。同一時刻
            // 基準で判定すれば、drain_due 後の pending には deadline
            // > now のエントリしか残らず、next_wait は必ず正の
            // duration を返すため、recv_timeout が即時 Ok になっても
            // 上書きされるのは sliding window 仕様（deadline 延長）と
            // して正しい振る舞いに収まる。
            let now = Instant::now();

            // 1. 期限到来分を 1 batch にまとめて発火する。
            //
            // recv 前に drain することで、同一 path の新着イベントが
            // notify_rx に既に queued されていても、期限切れの保留
            // エントリが先に発火する。
            if let Some(batch) = pending.drain_due(now) {
                if fs_tx.send(batch).is_err() {
                    return;
                }
            }

            // 2. 受信待ち時間を決定。保留が無ければ無限ブロック。
            let recv_result = match pending.next_wait(now) {
                Some(remaining) => notify_rx.recv_timeout(remaining),
                None => notify_rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            };

            // 3. 受信結果を分類して畳み込み / 即時 forward を行う。
            match recv_result {
                Ok(item) => {
                    let translated = match item {
                        Ok(ev) => convert_event(ev),
                        Err(e) => Some(vec![FsEvent::Error(classify_notify_error(e))]),
                    };
                    let Some(events) = translated else { continue };
                    let now = Instant::now();
                    for fs_ev in events {
                        // Rescan / Error は保留を追い越して専用 batch で即時
                        // 送出する。畳み込んで 100ms 遅らせると、状態乖離と
                        // 障害の検知が同じだけ遅れる。
                        let bypass = match fs_ev {
                            FsEvent::Rescan => FileChangeBatch::rescan(),
                            FsEvent::Error(failure) => FileChangeBatch::from_failure(failure),
                            other => {
                                pending.record(&other, now);
                                continue;
                            }
                        };
                        if fs_tx.send(bypass).is_err() {
                            return;
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {
                    // 次ループ先頭の drain_due で発火する。
                }
                Err(RecvTimeoutError::Disconnected) => {
                    // 上流（バックエンド）が drop された。残保留を 1 batch に
                    // まとめて flush して終了する。
                    if let Some(batch) = pending.drain_all() {
                        let _ = fs_tx.send(batch);
                    }
                    return;
                }
            }
        }
    });
    (fs_rx, handle)
}

/// `notify::Error` を自前の [`WatcherFailure`] へ写像する。
///
/// backend内部で保持した`notify::Error`は本関数で公開独自型へ変換し、
/// spec-board-fsのpublic APIには外部crateの型を一切漏らさない。
///
/// inotify 上限は backend によって `MaxFilesWatch` にも
/// `Io(StorageFull)`（ENOSPC）にもなるため、両方を資源枯渇として扱う。
/// `ErrorKind` だけで分岐すると、Linux で最も起きやすい ENOSPC 経路が
/// 一般 I/O に落ちて FE の文言が「監視上限」を案内できなくなる。
fn classify_notify_error(err: notify::Error) -> WatcherFailure {
    let kind = classify_notify_error_kind(&err.kind);
    WatcherFailure {
        kind,
        paths: err.paths.clone(),
        detail: err.to_string(),
    }
}

fn classify_notify_error_kind(kind: &notify::ErrorKind) -> WatcherFailureKind {
    match kind {
        notify::ErrorKind::PathNotFound | notify::ErrorKind::WatchNotFound => {
            WatcherFailureKind::WatchPathUnavailable
        }
        notify::ErrorKind::MaxFilesWatch => WatcherFailureKind::ResourceExhausted,
        notify::ErrorKind::Io(source) => classify_io_error_kind(source.kind()),
        notify::ErrorKind::Generic(_) | notify::ErrorKind::InvalidConfig(_) => {
            WatcherFailureKind::Unknown
        }
    }
}

fn classify_io_error_kind(kind: std::io::ErrorKind) -> WatcherFailureKind {
    match kind {
        std::io::ErrorKind::NotFound => WatcherFailureKind::WatchPathUnavailable,
        std::io::ErrorKind::PermissionDenied => WatcherFailureKind::PermissionDenied,
        std::io::ErrorKind::StorageFull | std::io::ErrorKind::OutOfMemory => {
            WatcherFailureKind::ResourceExhausted
        }
        _ => WatcherFailureKind::Io,
    }
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
#[path = "core_tests.rs"]
mod core_tests;
