# TaskCatalog — resident task state の aggregate

> 読者: Rust 初心者。`ProjectSession` が持つ task 集合がなぜ `HashMap` から
> `TaskCatalog` になったのか、`apply` がなぜ `&self` で次状態を返すのか、
> `expect` がなぜ消せたのかを理解するための実装ガイド。仕様（何ができるか）は
> `docs/spec-board/file-system-spec.md`、ドメイン全体の地図は
> [`ddd-domain-design.md`](./ddd-domain-design.md) を参照。本ドキュメントは
> 「なぜそう書いたか」に焦点を当てる（Issue #454）。

---

## 1. なぜ `HashMap<CanonicalTaskPath, Task>` から `TaskCatalog` に変えたのか

変更前、`ProjectSession.tasks` は `HashMap<CanonicalTaskPath, Task>` だった。
`open_project` / rescan / 各 command はいったん `ResolvedTaskSet`（`Vec<Task>`）を
作ってから `into_map()` で `HashMap` に詰め替えて session に入れ、読む側は
`snapshot.tasks().values().cloned().collect()` で `Vec<Task>` に戻していた。
この往復には 3 つの問題があった。

1. **重複キーが黙って後勝ちで潰れる**
   `HashMap` に同じキーで 2 回 `insert` すると後の値が勝ち、前の値は消える。
   表記揺れ（`./a.md` と `a.md`、Unix 上の `tasks\a.md` と `tasks/a.md`）で同じ
   canonical path に正規化される md が 2 つあると、どちらが残るかは走査順次第で、
   利用者には何も知らされなかった。
2. **順序が不定**
   `HashMap` の iteration 順は実行ごとに変わりうる（Rust の `HashMap` は意図的に
   乱数 seed を使う）。`children` / `reverse_links` の並びは resolver へ渡す
   candidate の順に依存するため、そのまま resolver へ流すと結果が揺れる。
   毎回 `Vec` に戻して sort し直す必要があった。
3. **`reresolve(..).expect(..)` が本番コードに 5 箇所残る**
   「session に入っている task は resolver 通過済みのはず」という規約に頼って
   `expect` していたが、型はそれを保証していなかった。`expect` は「絶対に
   `Err` にならない」と作者が信じている印であり、信じる根拠が型でなく規約だと、
   規約が崩れたときに panic で気づくことになる。

`TaskCatalog`（`src-tauri/src/task/task_catalog.rs`）はこの 3 点を型で解決する。

```rust
pub(crate) struct TaskCatalog {
    /// file_path 昇順。派生値は resolver 通過済み。
    tasks: Vec<Task>,
    /// canonical identity → `tasks` の添字。
    index: HashMap<CanonicalTaskPath, usize>,
}
```

`Vec` を正（source of truth）とし、`HashMap` は「どの添字にあるか」だけを持つ。
順序は `Vec` が決め、O(1) lookup は `index` が担う。`HashMap` の値に `Task` を
入れないので、`Vec` と `HashMap` で内容が食い違う状態が作れない。

---

## 2. 不変条件と、それを守る「生成経路の限定」

`TaskCatalog` が常に満たす不変条件は 3 つ。

1. canonical identity（`CanonicalTaskPath::from_file_path`）が一意
2. `tasks` は `file_path` 昇順で整列済み
3. 派生値（`children` / `reverse_links` / graph warning）が全 task の frontmatter と整合

「常に」を成立させる仕組みは単純で、**構築できる経路を 3 つに限定する**。

| 経路 | 入力 | 用途 |
|:--|:--|:--|
| `TaskCatalog::resolve(Vec<ParsedTask>)` | disk 走査の parse 結果 | open / rescan / conflict recovery |
| `TaskCatalog::apply(&self, TaskChange)` | 変更 1 件 | command / watcher の upsert・delete |
| `TaskCatalog::apply_all(&self, Vec<TaskChange>)` | 変更 N 件 | `update_columns` の一括 rename |

3 経路とも内部で `from_unique_candidates`（private）を通り、そこで
`resolve_lenient_candidates`（= `TaskIndex::rebuild_derived_with_warnings`）を呼んで
sort と派生値構築を行う。`Vec<Task>` や `HashMap` を直接渡すコンストラクタは無い。

### Rust の可視性で経路を閉じる

- struct のフィールド `tasks` / `index` は private（`pub` が付いていない）。
  同じモジュール `task_catalog` の中でしかフィールドに触れない
- struct 自体は `pub(crate)`（crate 内から型名は使える）だが、フィールドが private
  なので crate の他の場所から `TaskCatalog { tasks, index }` と書いて作ることはできない
- `TaskIndex::new(Vec<Task>)` も private にした。以前は `pub(crate)` で、任意の
  `Vec<Task>` から検証なしに `TaskIndex` を作れた。今は `TaskCatalog::to_index()`
  （内部で `TaskIndex::from_catalog`）からしか resident 由来の `TaskIndex` を作れない

これで「resident の task 集合は必ず resolver を通過している」が規約ではなく
型の事実になる。`replace_tasks(TaskCatalog)` は raw な map を受け取る API ではなく、
「検証済み aggregate の swap」になった。

### 重複はどう扱うか

`resolve` は candidate を raw `file_path` 文字列の昇順に並べてから、canonical
identity ごとに**先勝ち**で採用し、残りを `DuplicateTaskIdentity { identity, kept,
rejected }` として返す。`rebuild.rs` がこれを `duplicateTaskIdentity` の
`ProjectLoadWarning` に変換するので、project は開けたまま warning だけが出る
（Issue #458 の「部分失敗は warning に倒す」方針）。

注意点が 1 つ。disk 由来の candidate は parse 段階（`normalized_task_file_path`）で
`\` → `/` へ正規化済みなので、`tasks\a.md` と `tasks/a.md` は catalog に届く時点で
**同じ文字列**になる。`sort_by` は stable sort（同じ値の相対順を保つ）なので、
この場合は入力順で先に来たものが残る。入力順を決定的にするため、scanner の
`WalkDir` には `sort_by_file_name()` を付けてある（`crates/fs/src/task/file_scanner.rs`）。

---

## 3. `apply(&self)` が「次状態を返す」設計と CAS

`apply` は `&mut self` ではなく `&self` で、`self` を変えずに次状態を持つ
`TaskChangeSet` を返す。

```rust
pub(crate) fn apply(&self, change: TaskChange) -> Result<TaskChangeSet, TaskParseError>
```

初心者向けに「なぜ `&mut self` で自分を書き換えないのか」を説明する。

各 command の流れは次のとおり（`update_task` の例）。

```
1. snapshot = session の clone（この時点の revision を覚えておく）
2. snapshot.tasks().apply(Upserted(updated_task))  → change_set   ← disk I/O の前
3. disk に書く
4. commit(&snapshot.identity(), |session| session.replace_tasks(change_set.into_catalog()))
```

手順 4 の `commit` は **CAS（compare-and-swap）**で、「session の identity
（SessionId + revision）が snapshot を取ったときと同じなら差し替える、違えば
`Conflict` を返して closure を実行しない」という動きをする。
つまり commit が成功したなら、snapshot を取ってから commit するまでの間に
session は誰にも変更されていない。だから **snapshot の catalog に対して計算した
次状態は、session 上で `apply` した結果と同じ**になる。

もし `&mut self` にして closure の中で `session.tasks.apply_mut(..)` と書くと、

- (a) disk へ書く前に「この変更は resolver を通るか」「戻り値の Task は何か」を
  知るために、同じ計算を I/O 前にもう 1 回走らせることになる
- (b) closure の中で `Err`（親チェーンが深すぎる等）が出ても、disk はもう書き換わって
  いて巻き戻せない。しかも `commit` の closure 型 `FnOnce(&mut ProjectSession) -> T`
  は `Result` を返す前提になっていないので、契約自体を変える必要がある

`&self` で先に次状態を確定させれば、(a) は 1 回で済み、(b) は「`Err` なら disk に
触らず return」で済む。`TaskChangeSet` が `next: TaskCatalog` を**所有**しているのは、
commit closure が `into_catalog()` でその所有権を session に移すためである
（`move |session| session.replace_tasks(change_set.into_catalog())`）。

### 所有権の補足

`change_set.task(&key)` は `Option<&Task>`（借用）を返す。戻り値として IPC に返す
`Task` は `cloned()` で所有権付きのコピーを作る。その後 `change_set` は `move` closure
に渡されて `into_catalog()` で消費される。「借用したまま move する」ことは
借用チェッカが許さないので、`cloned()` が先、`move` が後、という順序になっている。

---

## 4. `BTreeMap` を作業台に使う理由

`apply_all` は変更を順に適用するための作業台として
`BTreeMap<CanonicalTaskPath, ParsedTask>` を使う。

```rust
let mut working: BTreeMap<CanonicalTaskPath, ParsedTask> = self.tasks.iter().map(..).collect();
for change in changes {
    match change {
        TaskChange::Upserted(candidate) => { working.insert(identity, *candidate) ... }
        TaskChange::Removed(path)       => { working.remove(&identity) ... }
    }
}
let next = Self::from_unique_candidates(working.into_values().collect())?;
```

`HashMap` でも insert / remove はできるが、`into_values()` の順が実行ごとに変わる。
resolver（`resolve_lenient_candidates`）は入力を sort してから派生値を作るので
最終的な `tasks` の順は同じになるが、「作業台の時点で順序が決まっている」ほうが
デバッグしやすく、`applied`（change ごとの結末）と突き合わせるときにも迷わない。
`BTreeMap` はキー順（ここでは `CanonicalTaskPath` の文字列順）で iteration するので
決定的である。

`insert` が `Some(old)` を返せば「既にあった」＝ `Updated`、`None` なら `Created`。
`remove` が `Some` なら `Removed`、`None` なら `AbsentOnRemove`。この結末を
`AppliedTaskChange` として入力順に並べたものが `TaskChangeSet::applied` で、
watcher は `outcome_of(&key)` で `task-created` / `task-updated` の種別を決める。

`affected` は「次状態の task のうち、変更前の同じ identity の task と値が違うもの」
（`self.get(id) != Some(task)` の全 field 比較）。parent を付け替えた子だけでなく、
`children` が変わった旧親・新親も拾える。`removed` は「変更前にあって次状態に
無い identity」を sort したもの。どちらも昇順なので、同じ入力に対して同じ出力になる
（テスト `change_set_affected_and_removed_are_sorted_and_deterministic`）。

---

## 5. `Box<ParsedTask>` と enum のサイズ

```rust
pub(crate) enum TaskChange {
    Upserted(Box<ParsedTask>),
    Removed(TaskFilePath),
}
```

Rust の enum は「一番大きい variant」のサイズになる。`ParsedTask` は title / body /
labels / links / extras などを持つ数百バイトの struct で、`TaskFilePath` は
`String` 1 本（24 バイト）。`Upserted(ParsedTask)` と書くと `Removed` を作るときも
`ParsedTask` 分のメモリが確保される。`Box` に載せると `Upserted` はポインタ 1 本
（8 バイト）になり、enum 全体は `TaskFilePath` と同じ程度に収まる。

`Box::new(candidate)` は heap 確保 1 回分のコストで、`*candidate` で中身を取り出せる
（`working.insert(identity.clone(), *candidate)`）。clippy の `large_enum_variant`
もこの形を推奨する。

---

## 6. `TaskIndex::new` を private にしても既存テストが動く理由

`task_index.rs` の末尾には `#[path = "task_index_xxx_tests.rs"] mod task_index_xxx_tests;`
が並んでいる。`#[path]` で読み込んだファイルは `task_index` モジュールの**子モジュール**
になる。Rust の可視性ルールでは「子は親の private item にアクセスできる」ので、
これらのテストは `TaskIndex::new(vec![..])` を今までどおり呼べる。

一方 `task_catalog_tests.rs` は `task_catalog` の子であって `task_index` の子ではないので、
`TaskIndex::new` は呼べない（コンパイルエラーになる）。これは意図どおりで、
catalog のテストは `TaskCatalog::resolve(..).catalog.to_index()` という本番と同じ
経路を通ることになる。

例外が 1 つある。`projection_tests.rs` は `projection.rs` の子で、projection が
「上流の不変条件に寄りかからず自力で有限停止する」契約を、cycle 入りの `Vec<Task>` を
resolver に通さずに渡して検証していた。`TaskCatalog` 経由だと cycle が warning へ倒れて
fixture の意図が壊れるため、`#[cfg(test)] TaskIndex::from_tasks_for_test(Vec<Task>)`
を用意して、テストビルドだけ resolver を迂回できるようにしてある。

---

## 7. `expect` を消せた理由

変更前は `open.rs` / `reactivation.rs` / `conflict_recovery.rs`（2 箇所）/
`handler.rs` / `aggregate.rs` に `ResolvedTaskSet::reresolve(..).expect(..)` があった。
たとえば `into_prepared`（cache hit で session を再活性化する経路）は、

```rust
// 変更前
ResolvedTaskSet::reresolve(self.tasks.into_values())
    .expect("cached session tasks were resolved before storage"),
```

と、`HashMap` の値を取り出して**もう一度 resolver を通し**、失敗しないはずだと
`expect` していた。これは `HashMap<_, Task>` という型が「resolver 通過済み」を
表現できないために必要だった再検証で、`TaskCatalog` は型そのものが
「`resolve` / `apply` を通った集合」を意味するので、再検証が不要になり
`self.tasks` を移送するだけになった。

```rust
// 変更後
PreparedProjectSession::new_with_warnings(self.root, self.config, self.labels,
    self.milestones, self.tasks, self.load_warnings)
```

`TaskRebuildReport.tasks` も `Vec<Task>` から `TaskCatalog` になったため、
open / rescan / conflict recovery は report をそのまま `replace_tasks` に渡す。
「型が保証しているものを実行時に再確認しない」——これが `expect` を消せた理由であり、
smart constructor の効用そのものである。

---

## 8. 関連

- 仕様: `docs/spec-board/file-system-spec.md` §ProjectSession と並行性契約 / エラーハンドリング
- 前段の設計: [`ddd-domain-design.md`](./ddd-domain-design.md) §2 / §6
- command 側の読み替え: [`update_task.md`](./update_task.md) / [`add_link.md`](./add_link.md) / [`remove_link.md`](./remove_link.md)
- 後続: #400（`TaskChangeSet` の `affected` / `removed` から IPC patch を生成）
