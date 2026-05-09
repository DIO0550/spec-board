# `spec-board-fs::watcher` 実装ガイド

`src-tauri/crates/fs/src/watcher.rs` の実装方針を、Rust の基礎概念込みで解説するドキュメント。仕様面（公開 API・FsEvent 変換テーブル）は [`docs/spec-board/file-system-spec.md`](../spec-board/file-system-spec.md) を参照。本ドキュメントは「**なぜそう書いたか**」を、Rust 初学者にも辿れるよう書き下す。

---

## 1. 何を作っているのか

「プロジェクトディレクトリ配下の `.md` ファイルが追加・更新・削除されたら、フロントエンドに通知する」機能の **バックエンド基盤**。本 Issue (#71) ではフロントエンド (Tauri IPC) との接続はせず、内部で使う `Watcher` 構造体だけを完成させる。

### 全体像（データフロー）

```
[OS のファイルシステム]
        │ inotify / FSEvents / kqueue 等のシグナル
        ▼
[notify クレート (外部)] —— OS ごとのネイティブ API を抽象化
        │ notify::Result<notify::Event>
        ▼  (mpsc チャネル ①)
[adapter スレッド (本実装)] —— notify::Event → FsEvent に変換
        │ FsEvent
        ▼  (mpsc チャネル ②)
[呼び出し側 = テスト or 後続 Issue の Tauri IPC 層]
```

矢印が 2 段あるのがポイント。なぜ 2 段なのかは [§4 の adapter スレッド](#4-adapter-スレッドが必要な理由) で解説する。

---

## 2. 採用した外部クレートと選定理由

### `notify = "8"`

ファイル監視の de facto 標準クレート。Linux=inotify / macOS=FSEvents / Windows=ReadDirectoryChangesW を統一 API でラップしてくれる。OS 別の実装を自前で書く意味は薄い。

#### `RecommendedWatcher` と `PollWatcher`

`notify` は 2 種類のバックエンドを提供する。

| バックエンド | 仕組み | 長所 | 短所 |
|:--|:--|:--|:--|
| `RecommendedWatcher` | OS のネイティブ API をプッシュ型で待ち受け | 即時性が高い、CPU 負荷が低い | OS 制限（inotify watch 上限など）に引っかかると失敗する |
| `PollWatcher` | 一定間隔でディレクトリを走査して差分検出 | どこでも動く、上限が無い | 検知が遅延する（本実装は 2 秒間隔）、CPU 負荷がある |

本実装では **「まず Recommended、ダメなら Poll」** という二段フォールバックを組んでいる。理由は §6 を参照。

### `thiserror = "2"`

エラー型の `Display` / `Error` 実装をマクロで生成してくれる。手書きすると `impl Display for ... { ... }` を毎回書くことになって退屈なので、慣用的に使われる。

```rust
#[derive(Debug, thiserror::Error)]
pub enum WatcherError {
    #[error("failed to initialize file system watcher: {0}")]
    Init(String),
    // ...
}
```

`#[error("...")]` の文字列がそのまま `Display` の出力になる。`{0}` は variant の中身を埋め込む構文。

### `tempfile = "3"` (dev-dependencies)

テスト用に一時ディレクトリを作るやつ。`TempDir::new()` で作り、変数が drop されると自動でディレクトリごと削除される。OS の temp 領域を汚さないために必須。

---

## 3. 公開 API の設計

### 3.1 `Watcher` 構造体

```rust
pub struct Watcher {
    backend: Option<Backend>,
    adapter_handle: Option<JoinHandle<()>>,
}
```

#### `Option<T>` の意味

`Option<T>` は **「値があるかもしれないし、無いかもしれない」** を型で表す Rust の標準 enum。

```rust
enum Option<T> {
    Some(T),   // 値あり
    None,      // 値なし
}
```

C 言語の null ポインタや TypeScript の `T | undefined` に相当するが、**Rust では「無いかもしれない」を型で強制する**ので、うっかり null 参照する事故が起きない。

#### なぜ `Option` で包むのか

`Watcher::drop` の中で `backend` だけを先に解放したい。しかし `&mut self` から普通にフィールドを「奪い取る」（move する）ことはできない。これを解決する慣用句が `Option::take()`:

```rust
fn drop(&mut self) {
    self.backend.take();  // フィールドを None に置き換え、中身を取り出して即 drop
    if let Some(handle) = self.adapter_handle.take() {
        let _ = handle.join();
    }
}
```

`take()` は中身を取り出して `Option` の中身を `None` に置き換える。「フィールドから奪い取る」ためのイディオム。`Option` で包んでいない `Backend` だと、Drop の途中で部分 move ができず、コンパイルが通らない。

### 3.2 `FsEvent` enum

```rust
pub enum FsEvent {
    Created(PathBuf),
    Modified(PathBuf),
    Removed(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
    Other(PathBuf),
    Error(String),
    Rescan,
}
```

#### enum variant の 3 形式

Rust の enum は variant ごとに「中身の持ち方」を変えられる:

| 形式 | 例 | 用途 |
|:--|:--|:--|
| ユニット | `Rescan` | 値を持たない |
| タプル | `Created(PathBuf)` | 順番に値を持つ（少数のとき） |
| 構造体 | `Renamed { from, to }` | 名前付きで複数の値を持つ（読みやすさ重視） |

`Renamed` だけ構造体形式にしているのは、`Renamed(PathBuf, PathBuf)` だと「どっちが from でどっちが to か」が呼び出し側で分かりにくいから。

#### `PathBuf` と `&Path`

| 型 | 性質 | C++ 類比 |
|:--|:--|:--|
| `Path` | 借用 (borrowed)、サイズ未確定 | `string_view` |
| `PathBuf` | 所有 (owned)、ヒープ上の文字列バッファ | `string` |

`FsEvent` は呼び出し側が値として保持・移送するので、所有型 `PathBuf` を使う。関数の引数で「読むだけ」のときは借用 `&Path` を使う。`String` / `&str` の関係と同じ。

### 3.3 `WatcherError` enum

```rust
#[derive(Debug, Error)]
pub enum WatcherError {
    Init(String),
    PathNotFound(PathBuf),
    Io(#[from] std::io::Error),
}
```

#### `#[from]` の意味

`thiserror` のアトリビュート。これが付くと、`std::io::Error` から `WatcherError` への `From` トレイト実装が自動生成され、`?` 演算子で透過的に変換できるようになる:

```rust
fn validate_path(path: &Path) -> Result<(), WatcherError> {
    let metadata = std::fs::metadata(path)?;  // io::Error が WatcherError::Io に自動変換
    // ...
}
```

`?` は「`Result::Err` だったら早期 return、`Ok` なら中身を取り出す」糖衣構文。型が違う場合は `From` で変換できれば OK。

---

## 4. adapter スレッドが必要な理由

### 直接 `Receiver<FsEvent>` を渡せばいいのでは？

`notify` の API は `EventHandler` というクロージャを受け取り、そのクロージャ内で `notify::Result<Event>` が渡ってくる。

```rust
// もし adapter なしで書こうとすると:
let mut watcher = RecommendedWatcher::new(
    move |res: notify::Result<Event>| {
        // ここで notify::Event を直接 caller に届けたいが…
        // クロージャは notify が内部で持つ OS スレッド上で実行される
    },
    config,
)?;
```

問題は次の 3 つ:

1. **型変換のため**: 呼び出し側に渡したいのは `FsEvent`（独自型）であって `notify::Event` ではない。クロージャの中で都度変換するのは可能だが、変換ロジックが分散して保守性が落ちる
2. **公開境界の隔離**: `notify::*` の型を `Sender<notify::Event>` のような形で外に漏らしたくない（CLAUDE.md「外部 crate の型を境界に出さない」規約）
3. **Drop タイミングの制御**: notify の OS スレッドから直接 caller のチャネルに送ると、「notify を停止した瞬間にキューに残ったイベントをどう扱うか」が制御しづらい

### 採用した構成

```
notify の OS スレッド (notify 内部)
      │ tx_notify.send(notify::Result<Event>)
      ▼
mpsc チャネル ① (notify_tx, notify_rx)
      │ notify_rx.recv()
      ▼
adapter スレッド (本実装で spawn)
      │ convert_event() で変換
      │ fs_tx.send(FsEvent)
      ▼
mpsc チャネル ② (fs_tx, fs_rx)
      │ fs_rx を caller に渡す
      ▼
caller (テスト or 後続 IPC 層)
```

adapter スレッドの責務:
- チャネル ① から `notify::Result<Event>` を受け取り
- `convert_event()` で `FsEvent` に変換
- チャネル ② に push
- Ok/Err どちらの場合も適切に処理（Err は `FsEvent::Error` に変換、黙殺しない）

### `mpsc::channel` とは

§前メッセージで詳しく説明したので簡単に: 「**送信側 (Sender) → 受信側 (Receiver) の単方向 FIFO キュー**」。複数の Sender から送れる、Receiver は 1 つだけ。スレッド境界を越える値渡しに使う標準ライブラリの仕組み。

```rust
let (tx, rx) = mpsc::channel::<T>();
tx.send(value)?;
let v = rx.recv()?;
```

#### 切断のセマンティクス（重要）

- **すべての `Sender` が drop されると** → `recv()` が `Err(RecvError::Disconnected)` を返す
- **`Receiver` が drop されると** → `send()` が `Err(SendError)` を返す

この性質が Drop 同期停止（§5）の肝になる。

---

## 5. Drop 同期停止の仕組み

### 課題

`Watcher` を drop した後に発生したファイル変更が `Receiver<FsEvent>` に届くと、テストで「Drop 後にイベントが届かないこと」を確認できない。後続 Issue で「ウォッチャを停止して別ディレクトリに切り替える」ような操作を行うとき、停止中に旧ディレクトリのイベントが混ざるとバグの温床になる。

### 設計

```rust
impl Drop for Watcher {
    fn drop(&mut self) {
        // ① backend を drop
        self.backend.take();

        // ② adapter スレッドの終了を待つ
        if let Some(handle) = self.adapter_handle.take() {
            let _ = handle.join();
        }
    }
}
```

#### なぜ「backend 先 → adapter join 後」の順なのか

連鎖反応を起こしている:

1. `self.backend.take()` で `Backend` enum が drop される
2. `Backend` の中の `RecommendedWatcher` / `PollWatcher` が drop される
3. notify が内部で OS 監視スレッドを停止する
4. notify ハンドラクロージャが保持している `Sender<notify::Result<Event>>` の clone も drop される
5. `notify_tx` の最後の Sender が消えたので、adapter スレッドの `notify_rx.recv()` が `Err(Disconnected)` を返す
6. adapter スレッドの `while let Ok(item) = notify_rx.recv()` ループが抜ける
7. adapter スレッドが終了する
8. `handle.join()` が完了する

逆順（先に adapter を join）だと、adapter は永遠に `recv()` で待ち続けるのでデッドロックする。

#### 「Drop 後に新規イベントが届かない」を保証する根拠

- backend が drop された時点で、OS からのシグナルは受け取られない
- adapter スレッドは join するまで動いているが、新規イベントは来ないので何もできない
- adapter スレッドが終了した時点で `fs_tx` も drop される
- caller の `fs_rx` は、Drop 前に enqueue されていたイベントを順次取り出した後、最終的に `Disconnected` を返す
- **Drop 完了後に書き込まれたファイルのイベントは、もう誰も notify に通知できない**

#### 注意点（Drop 前に enqueue されたイベントは届く）

`Drop` が始まった瞬間にちょうど `notify_tx.send` が完了していたイベントは、adapter が変換してチャネル ② に push する。caller はそれを `recv` できる。これは「Drop 完了 *後* に発生したイベント」とは別物。テストでは `drain_events` で初期イベントを flush してから drop することで、ノイズを切り分けている。

---

## 6. 二段フォールバックの仕組み

### 課題

Linux で大量のファイルを監視すると、inotify の watch 上限 (`/proc/sys/fs/inotify/max_user_watches`) を超えて `RecommendedWatcher` が失敗することがある。失敗したら諦めるのではなく、`PollWatcher` で動作継続したい。

### 失敗が 2 種類ある

```rust
fn try_build_recommended(...) -> Result<Backend, String> {
    let mut w = RecommendedWatcher::new(...)?;        // 失敗パターン 1: 初期化失敗
    w.watch(path, RecursiveMode::Recursive)?;         // 失敗パターン 2: 監視開始失敗
    Ok(Backend::Recommended(w))
}
```

`new` は OS リソース確保に失敗することがあり、`watch` は inotify watch 上限超過などで失敗する。**両方を等しくフォールバック対象にする**。

### `build_backend_with` の設計

```rust
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
            &recommended_err, &poll_err,
        ))),
    }
}
```

#### ジェネリクス `<R, P>` と `where` 節

```rust
where
    R: FnOnce(Sender<...>, &Path) -> Result<Backend, String>,
```

「R は『`Sender` と `&Path` を受け取って `Result<Backend, String>` を返す関数』ならなんでも良い」という制約。`Fn` / `FnMut` / `FnOnce` の 3 種類があるが、`FnOnce` は **1 回だけ呼べる**。今回は呼び出し回数が高々 1 回なので最弱の `FnOnce` で十分。

#### なぜ関数を引数として注入するのか

**テストのため**。本物の `notify::*` を組み立てない、単なる `Ok(...)` / `Err(...)` を返すクロージャでテストできる:

```rust
let backend = build_backend_with(
    tx, &path,
    |_t, _p| Err("new failed: inotify limit".into()),  // 偽の recommended
    move |_t, _p| Ok(dummy),                            // 偽の poll
).expect("should fall back");
```

これで「new が失敗 → poll に落ちる」というフォールバック契約を、OS の状態に依存せず決定論的に検証できる。本番の `build_backend` は `build_backend_with(tx, path, try_build_recommended, build_poll_backend)` という薄いラッパに過ぎない。

#### `combine_init_errors` の独立

両方のバックエンドが失敗したときのエラーメッセージ整形だけを純粋関数として切り出した:

```rust
pub(crate) fn combine_init_errors(recommended: &str, poll: &str) -> String {
    format!("recommended watcher failed: {recommended}; poll watcher failed: {poll}")
}
```

文字列フォーマットは純粋なので、`assert!(s.contains("recommended X"))` のような単体テストでフォーマットが崩れないことを保証できる。

---

## 7. `convert_event` の変換ロジック

```rust
fn convert_event(ev: NotifyEvent) -> Option<Vec<FsEvent>> {
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
        EventKind::Modify(ModifyKind::Name(_)) => vec![FsEvent::Other(first)],
        EventKind::Modify(_) => vec![FsEvent::Modified(first)],
        _ => vec![FsEvent::Other(first)],
    };
    Some(translated)
}
```

### 戻り値が `Option<Vec<FsEvent>>` の理由

| 戻り値 | 意味 |
|:--|:--|
| `None` | 送信する FsEvent が無い（adapter は何もしない） |
| `Some(vec![ev])` | 通常の 1 イベント |
| `Some(vec![])` | 「送信無し」を表すなら `None` で表現すべきなので、現状は出さない |

`Option` で「変換結果を発行するか否か」を、`Vec` で「将来的に 1 イベントが複数 FsEvent に展開される可能性」を表現している（現在は常に 1 件）。

### Rescan を最優先で判定する理由

`notify::Event::need_rescan()` は **「キューが溢れたかも」のシグナル**。このときイベントの paths は空のことが多い。`paths.is_empty()` のガードを先に書くと Rescan が落ちて、呼び出し側が「FS と乖離したまま気づかない」状態になる。レビュー指摘で修正したポイント。

### パターンマッチの順序

```rust
EventKind::Modify(ModifyKind::Name(_)) if ev.paths.len() >= 2 => { /* Renamed */ }
EventKind::Modify(ModifyKind::Name(_)) => { /* Other (paths不足で確定不能) */ }
EventKind::Modify(_) => { /* Modified */ }
```

`if` のついた match アームを **ガード付きパターン** と呼ぶ。Rust の match は **書いた順に評価** されるので、最も具体的なものから先に書くのがセオリー。順序を逆にすると、`Modify(Name(_))` の rename 確定ケースが汎用 `Modify(_)` アームに食われて `Modified` に降格してしまう。

### `Modify(Name(_))` の paths 不足ケースが `Other` な理由

notify は OS によって、rename を `from` だけのイベント・`to` だけのイベント・両方を含む 1 イベントの 3 通りで投げる。「片方しか無い」ときは rename を確定できないので、`Modified` ではなく `Other` に降格する（`Modified` だと「内容が変わった」誤った意味になってしまう）。

---

## 8. `validate_path` の TOCTOU 対策

### 改修前（バグあり）

```rust
fn validate_path(path: &Path) -> Result<(), WatcherError> {
    if !path.try_exists()? {
        return Err(WatcherError::PathNotFound(...));
    }
    let metadata = std::fs::metadata(path)?;  // ← ここで NotFound が起きうる
    if !metadata.is_dir() { ... }
    Ok(())
}
```

`try_exists()` で「存在する」と確認した直後に、別プロセスがディレクトリを削除したら、`metadata()` が `NotFound` で失敗する。この `NotFound` は `?` で `WatcherError::Io` に変換されてしまい、本来返すべき `PathNotFound` から逸脱する。これが **TOCTOU (Time-Of-Check to Time-Of-Use) race** という古典的バグ。

### 改修後

```rust
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
```

`metadata()` を 1 回呼ぶだけにする。

| 条件 | 戻り値 |
|:--|:--|
| `Ok(metadata)` かつ `is_dir() == true` | `Ok(())` |
| `Ok(metadata)` かつ `is_dir() == false`（ファイル等） | `PathNotFound` |
| `Err(NotFound)` | `PathNotFound` |
| `Err(その他)`（権限不足など） | `Io` |

「TOCTOU の隙間が物理的に存在しない実装に書き直す」のが正解。検査回数を減らすことで race が消える、という典型的な対処法。

---

## 9. 同期停止テスト（`drain_until_disconnected`）

### 何を確認したいか

「`Watcher` を drop した後にファイルを作っても、その変更を caller が `recv()` で観測することは無い」を厳密に検証したい。

### 検証戦略

```
1. Watcher 起動
2. 軽くウォーミングアップ書き込み + イベントを drain（ノイズ除去）
3. drop(watcher)                    ← 同期停止
4. ユニーク名のファイルを作成      ← Drop 後の書き込み
5. drain_until_disconnected() で残りのイベントを全部取得
6. 取得したイベント中に「ユニーク名」が **無い** ことを assert
```

ユニーク名は `format!("drop_marker_{}.md", std::process::id())`。同名衝突を避けるため。

### `drain_until_disconnected` の安全装置

```rust
fn drain_until_disconnected(
    rx: &Receiver<FsEvent>,
    per_recv_timeout: Duration,
    overall_deadline: Duration,
) -> Vec<FsEvent> {
    let stop_at = Instant::now() + overall_deadline;
    loop {
        let remaining = match stop_at.checked_duration_since(Instant::now()) {
            Some(r) if !r.is_zero() => r,
            _ => panic!("drain_until_disconnected: ..."),
        };
        let next_timeout = std::cmp::min(per_recv_timeout, remaining);
        match rx.recv_timeout(next_timeout) {
            Ok(ev) => out.push(ev),
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => return out,
        }
    }
}
```

`overall_deadline` が無いと、Drop の停止ロジックにバグがあったときテストが永久ハングしてテストスイート全体を巻き込む。レビュー指摘で追加した安全装置。

---

## 10. テスト構造のこころ

### TDD 寄りの設計

`build_backend_with` / `combine_init_errors` を `pub(crate)` で切り出して単体テスト可能にしているのは、**「OS 依存のないコア・ロジックは決定論的にテストする」** という方針。本番経路の `build_backend` は `build_backend_with(tx, path, real_recommended, real_poll)` の薄いラッパに過ぎない。

### テストヘルパーの役割

| ヘルパー | 役割 |
|:--|:--|
| `make_files(root, &[...])` | テスト用に空ファイルを一気に作る（パターン違いで複数あり）|
| `wait_for_event_at(rx, path, timeout)` | 特定パスのイベントが届くまで待つ。OS が無関係なイベントを多重発火する場合のノイズを吸収 |
| `drain_events(rx, quiet_window)` | バッファに溜まった全イベントを読み捨てる。テスト前段でノイズを除去するのに使う |
| `drain_until_disconnected` | §9 参照。Drop 後の検証専用 |
| `make_dummy_backend` | フォールバックテスト用の偽 Backend（`(Backend, TempDir)` を返してリーク回避）|

### パラメタライズドテーブルテスト

`convert_event_table` テストは「入力パターン × 期待出力」のテーブルを 1 つの `#[test]` の中で回している:

```rust
let cases = vec![
    Case { name: "...", kind: ..., paths: ..., expected: ... },
    // ...
];
for c in cases {
    let actual = convert_event(ev_with(c.kind, c.paths.clone()));
    assert_eq!(actual, c.expected, "case `{}` failed", c.name);
}
```

variant ごとに `#[test]` を並べるより一覧性が高い。`assert_eq!` の第 3 引数にケース名を渡しているので、失敗したときどのケースか即座に分かる。

---

## 11. プロジェクト規約との対応

### CLAUDE.md「外部 crate の型を境界に出さない」

- 公開 API シグネチャ (`pub fn` / `pub struct` / `pub enum`) に `notify::*` 型は一切出さない
- 内部の `Backend` は `pub(crate)` でクレート内に閉じている（`build_backend_with` のテストのため）
- 検証コマンド: `grep -nE "notify::(Event|Watcher|...)" src-tauri/crates/fs/src/watcher.rs` で `pub` 行に出ていないことを確認

### サブクレート分離の意図

`spec-board-fs` は重い外部依存（`walkdir` / `notify` / 将来 `reqwest`）を集約するサブクレート。本体クレート `spec-board` は `path = "crates/fs"` 経由でのみ参照する。これによりライブラリ差し替えの影響を 1 箇所に閉じ込められる（例: `notify` を別実装に差し替えても `spec-board` 本体は無変更）。

### スコープ外（後続 Issue）

- 拡張子フィルタ（`.md` のみ）
- デバウンス／イベント集約（同一ファイルの 100ms 連続変更を 1 回にまとめる等）
- 監視対象パスの動的追加・削除
- Tauri IPC との接続（`emit("task-created", ...)` 等）
- `WriteIgnoreRegistry` との統合（自己書き込み抑制）

---

## 12. Rust 基礎用語リファレンス

このドキュメントで使った主な Rust 用語を一覧化:

| 用語 | 意味 |
|:--|:--|
| **所有権 (ownership)** | 値は常に 1 人の所有者を持ち、所有者がスコープを抜けると自動 drop される |
| **借用 (borrow)** | 所有を奪わずに参照だけ渡す（`&T` 不変借用 / `&mut T` 可変借用） |
| **`move`** | クロージャや関数呼び出しで値の所有権を移動する |
| **`drop`** | 値が破棄されること。明示的に `drop(x)` も可能 |
| **`Drop` トレイト** | デストラクタを実装するためのトレイト |
| **`Result<T, E>`** | 成功 `Ok(T)` / 失敗 `Err(E)` を表す enum |
| **`Option<T>`** | 値あり `Some(T)` / 無し `None` を表す enum |
| **`?` 演算子** | `Result::Err` だったら早期 return、`Ok` なら中身を取り出す |
| **`#[derive(...)]`** | トレイト実装を自動生成する属性（例: `Debug`, `Clone`） |
| **`#[cfg(test)]`** | テストビルド時のみコンパイルする属性 |
| **`pub` / `pub(crate)`** | 公開可視性の制御。`pub(crate)` はクレート内のみ |
| **enum variant** | enum の各状態。ユニット / タプル / 構造体形式の 3 種類 |
| **match のガード** | `pattern if condition =>` の形式。条件が真のときのみマッチ |
| **`impl Trait`** | 戻り値の型を「ある trait を実装する型」と書く構文 |
| **`FnOnce` / `FnMut` / `Fn`** | クロージャを受け取るときの 3 段階の制約。`FnOnce` が一番ゆるい |
| **`Send` / `Sync`** | スレッド境界を越えられるかを示すマーカートレイト |
| **`Box<T>`** | ヒープに値を確保する所有スマートポインタ |
| **`Arc<T>`** | スレッド安全な参照カウント共有ポインタ。`Atomic Reference Counted` |
| **`mpsc::channel`** | スレッド間通信のキュー（multi-producer single-consumer） |
| **`JoinHandle`** | `thread::spawn` の戻り値。`.join()` で終了を待つ |
| **`thiserror`** | エラー型用のマクロクレート |
| **`PathBuf` / `Path`** | パスの所有型と借用型（`String` / `&str` の対応関係） |

---

## 13. 関連リンク

- 仕様: [`docs/spec-board/file-system-spec.md`](../spec-board/file-system-spec.md) の「`spec-board-fs::watcher` 公開 API」節
- 実装: [`src-tauri/crates/fs/src/watcher.rs`](../../src-tauri/crates/fs/src/watcher.rs)
- Issue: #71
- 公式ドキュメント
  - [Rust Book — std::sync::mpsc](https://doc.rust-lang.org/book/ch16-02-message-passing.html)
  - [notify crate (docs.rs)](https://docs.rs/notify/8/notify/)
  - [thiserror crate (docs.rs)](https://docs.rs/thiserror/2/thiserror/)
