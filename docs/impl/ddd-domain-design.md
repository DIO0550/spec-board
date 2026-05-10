# DDD ドメイン設計（Rust バックエンド）

> 本ドキュメントは Rust 初心者を主な読者として、`spec-board` バックエンド
> （`src-tauri/src/` および `src-tauri/crates/fs/src/`）が採用している DDD
> 戦術的パターンの設計判断を解説する。仕様（何ができるか）は `docs/spec-board/`
> 配下を参照。本ドキュメントは「なぜそう書いたか」に焦点を当てる。

---

## 1. なぜ newtype を使うのか

Rust では同じ「中身」（例: `String`）を別の概念として扱うときに、`type` alias
ではなく `struct Foo(String)` という newtype を使う。代表的なメリットは以下。

1. **取り違えを型で防げる**
   - `String` には「タスクの相対パス」も「カラム名」も「YAML から読んだ任意の
     文字列」も入る。これらを 1 つの `String` 型で扱うと、API 引数の取り違え
     （column 名にタスクパスを渡す等）がコンパイル時に検出されない。
   - newtype `TaskFilePath(String)` / `ColumnName(String)` を分けると、
     関数シグネチャの段階でミスが弾かれる。
2. **不変条件を構築時にだけ検証すればよい**
   - 「空文字でない」「`.md` 拡張子で終わる」など、本来 string が満たすべき
     ルールを `try_from_str` のような単一の関数に閉じ込められる。一度 newtype
     を構築できたら、以降のコードは「不変条件は満たされている」前提で書ける。
3. **意味が API シグネチャに現れる**
   - `fn foo(path: &str)` よりも `fn foo(path: &TaskFilePath)` の方が読み手に
     とって意味が明確で、ドキュメント代わりになる。

### `#[serde(transparent)]` の役割

`#[derive(Serialize, Deserialize)]` を素朴に付けると、newtype は
`{"0": "tasks/foo.md"}` のような JSON にシリアライズされてしまう。
`#[serde(transparent)]` を付けると、内部の `String` をそのまま JSON に
出すようになる。これにより、

- フロントエンドや `.spec-board/config.json` が見る JSON 形状は
  newtype 化前の `String` と完全に同一
- Rust コード上だけで型が締まる

という二重の利点が得られる。

### strict / lenient の 2 系統コンストラクタ

VO のコンストラクタを 2 系統用意している。

- `try_from_str(&str) -> Result<Self, _Error>` — strict。空文字や
  拡張子不一致を拒否する。scanner 由来の自分自身のパスや、新規生成された
  ファイル名のような「本物の path」用。
- `from_lenient(impl Into<String>) -> Self` — lenient。frontmatter から
  読んだ `parent: ''` のような怪しい値も拒否せず受け取る。`Task.parent` /
  `Task.links` などは「ユーザが書いた値を保持しつつ後段の graph builder
  で warning に落とす」既存挙動を守る必要があるため、こちらを使う。

`Deserialize` も大半の VO で custom 実装にしている。derive Deserialize は
内部 `String` を素通しで復元してしまい strict 不変条件を迂回するため、
代わりに `from_lenient` を呼ぶ実装に統一している。strict 検証が必要な経路
（scanner 由来の id / file_path など）では明示的に `from_relative_path` /
`try_from_str` を呼ぶことで担保する。

---

## 2. Aggregate 境界の引き方

DDD の Aggregate は「不変条件を一緒に守るべきオブジェクトのまとまり」。
本プロジェクトでは以下を Aggregate Root として扱う。

| Aggregate Root | 責務 | 場所 |
|:--|:--|:--|
| `Task` | 1 タスクの不変条件（id == file_path、warnings は parse 由来） | `src/task/index.rs` |
| `TaskIndex` | タスク集合の整合性（parent 存在、循環検出、children / reverse_links 派生） | `src/task/index.rs` |
| `Config` | カラム集合と done_column の整合性、card_order の clean | `src/config.rs` |
| `AppState` | 全 Mutex の lock 取得順序契約 | `src/state.rs` |

Aggregate 境界の引き方の指針:

1. **VO は値、Aggregate は集合のオーナー**
   - `TaskFilePath` / `ColumnName` のような VO は「値」であり、複数の
     Aggregate にまたがって参照される。VO 自身は他の VO を所有しない
     （VO の中に Aggregate を持たない）。
2. **Aggregate メソッドが副作用と検証を集約する**
   - 例: `TaskIndex::build_children` は「parent 存在検証 → children 派生」
     という一連の処理を 1 つのメソッドにまとめる。これにより、外部から
     見た不変条件（「children は parent からの逆引きで派生したものである」）
     が破られにくくなる。
3. **Aggregate を跨ぐ参照は VO の値で行う**
   - `AppState.tasks_cache: HashMap<TaskFilePath, Task>` のように、
     Aggregate `AppState` から `Task` を引くキーは VO `TaskFilePath` を使う。
     `Task` 自身を `AppState` の中に持つわけではなく、別 Aggregate である
     `Task` 集合へのキーとして VO を保有する形になる。

---

## 3. ドメインモデル（ASCII 図）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       本体クレート: spec-board (src/)                        │
│                                                                              │
│  ┌──────────────────────────────────┐    ┌──────────────────────────────┐    │
│  │  Aggregate: Task (AR)            │    │  Aggregate: Config (AR)       │    │
│  │  ┌────────────────────────────┐  │    │  ┌────────────────────────┐   │    │
│  │  │ id          : TaskFilePath │  │    │  │ version  : u32          │   │    │
│  │  │ file_path   : TaskFilePath │  │    │  │ columns  : Vec<Column>  │   │    │
│  │  │ title       : TaskTitle    │  │    │  │ card_order : CardOrder  │   │    │
│  │  │ status      : ColumnName   │  │    │  │ done_column: Option<    │   │    │
│  │  │ parent      : Option<      │  │    │  │              ColumnName>│   │    │
│  │  │              TaskFilePath> │  │    │  └────────────────────────┘   │    │
│  │  │ labels      : Vec<Label>   │  │    │   ┌──────────────────────┐    │    │
│  │  │ links       : Vec<         │  │    │   │ Column                │    │    │
│  │  │              TaskFilePath> │  │    │   │  name : ColumnName    │    │    │
│  │  │ children    : Vec<         │  │    │   │  order: u32           │    │    │
│  │  │              TaskFilePath> │  │    │   └──────────────────────┘    │    │
│  │  │ reverse_links: Vec<        │  │    │   ┌──────────────────────┐    │    │
│  │  │              TaskFilePath> │  │    │   │ CardOrder = BTreeMap │    │    │
│  │  │ priority    : Option<      │  │    │   │  <ColumnName,         │    │    │
│  │  │              Priority>     │  │    │   │   Vec<TaskFilePath>>  │    │    │
│  │  │ body, extras, warnings ... │  │    │   └──────────────────────┘    │    │
│  │  └────────────────────────────┘  │    └──────────────────────────────┘    │
│  └────────┬─────────────────────────┘                                         │
│           │                                                                   │
│           ▼                                                                   │
│  ┌──────────────────────────────────┐    ┌──────────────────────────────┐    │
│  │  Aggregate: TaskIndex            │    │  Aggregate: AppState          │    │
│  │  ┌────────────────────────────┐  │    │  ┌────────────────────────┐   │    │
│  │  │ tasks: Vec<Task>           │  │    │  │ project_path : Mutex<   │   │    │
│  │  └────────────────────────────┘  │    │  │   Option<ProjectRoot>>  │   │    │
│  │   - validate_parent_existence    │    │  │ config       : Mutex<   │   │    │
│  │   - validate_parent_hierarchy    │    │  │   Option<Config>>       │   │    │
│  │   - build_children               │    │  │ tasks_cache  : Mutex<   │   │    │
│  │   - build_reverse_links          │    │  │   HashMap<TaskFilePath, │   │    │
│  │   - resolve_parent_for_new_task  │    │  │             Task>>      │   │    │
│  │   - validate_chain_from_parent   │    │  │ watcher_handle: Mutex...│   │    │
│  └──────────────────────────────────┘    │  │ write_ignore: WriteIgn..│   │    │
│                                          │  └────────────────────────┘   │    │
│  ┌──────────────────────────────────┐    │   - lock 順序: project_path   │    │
│  │  Value Objects                    │    │     → config → tasks_cache    │    │
│  │   - TaskFilePath  (newtype String)│    │     → watcher_handle          │    │
│  │   - TaskTitle     (newtype String)│    │     → write_ignore            │    │
│  │   - TaskFileName  (newtype String)│    └──────────────────────────────┘    │
│  │   - Label         (newtype String)│                                        │
│  │   - ColumnName    (newtype String)│    ┌──────────────────────────────┐    │
│  │   - ProjectRoot   (newtype PathBuf)│    │  ProjectRoot (VO)             │    │
│  └──────────────────────────────────┘    │   - newtype PathBuf           │    │
│                                          └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 依存方向 (本体 → sub-crate)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│           サブクレート: spec-board-fs (src-tauri/crates/fs/)                  │
│  task::kebab_case / task::unique_filename / task::file_scanner               │
│  watcher::core / watcher::handle / watcher::write_ignore                     │
│  config::config_io                                                           │
│                                                                              │
│  注: VO は本体側に置く。sub-crate の API は &str / PathBuf のまま不変         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. VO 一覧と不変条件

| VO | 親 | 内部型 | strict 不変条件 | lenient コンストラクタ |
|:--|:--|:--|:--|:--|
| `TaskFilePath` | `task::value_objects` | `String` | 空文字不可 / forward-slash / `.md` 拡張子 / 先頭末尾 `/` 不可 / drive prefix 除去済み | あり（frontmatter `parent` / `links` 用、空文字も保持） |
| `TaskTitle` | `task::value_objects` | `String` | 空文字不可（whitespace-only は valid） | あり（frontmatter 由来の whitespace-only を保持） |
| `TaskFileName` | `task::value_objects` | `String` | 空文字不可 / `/` `\\` 含まず / `.md` 拡張子 | なし（永続化対象外） |
| `Label` | `task::value_objects` | `String` | 空文字不可 | あり（lenient deserialize 用） |
| `ColumnName` | `config::value_objects` | `String` | 空文字不可 | あり（config.json 由来の前後空白 / 空文字を保持） |
| `ProjectRoot` | `project::value_objects` | `PathBuf` | 空文字不可（実在性は別途検証） | なし（Tauri command 引数で `try_from_str` 明示） |

Map / Set のキーになる `TaskFilePath` / `ColumnName` のみ `PartialOrd, Ord`
を付与している（`BTreeMap` のキー、ソート用）。それ以外の VO は `Hash, Eq,
PartialEq` のみ。

---

## 5. データフローの抜粋

### `open_project` 経路

```
FE invoke { path: string }
   │
   ▼
#[tauri::command] open_project(path: String)
   │  ProjectRoot::try_from_str(&path)   ← VO 構築（境界）
   ▼
open_project_impl(state, root: &ProjectRoot)
   - validate_directory(root.as_path())
   - load_or_default(root.as_path())   → Config { columns: [Column { name: ColumnName, .. }] }
   - scan_md_files(root.as_path())     → Vec<PathBuf>     (sub-crate API は &Path / PathBuf のまま)
   - 各 PathBuf について:
       Task::from_markdown(&bytes, &TaskParseContext {
           file_path: rel,
           default_status: ColumnName,
       })
   - TaskIndex::from(tasks).build_children()?.build_reverse_links()
   ↓
HashMap<TaskFilePath, Task> を AppState.tasks_cache に commit
   ↓
OpenProjectPayload { tasks: Vec<Task>, columns: Vec<ColumnName> }
   ↓ (#[serde(transparent)] により JSON 形状不変)
FE: { tasks: [...], columns: ["Todo", "In Progress", "Done"] }
```

VO 構築は **3 つの境界**でのみ起きる:

1. Tauri command 引数の Rust 側エントリ（`open_project` の第一行）
2. sub-crate からの戻り値を本体側でラップする箇所（`scan_md_files` の
   `Vec<PathBuf>` を `TaskFilePath` に詰め直す等）
3. `Task::from_markdown` 内で frontmatter 由来の値を VO に詰める（`from_lenient`）

それ以外の本体コードは「VO を引数に受けて VO を返す」純粋なドメイン世界で
動く。

---

## 6. lock 取得順序契約（AppState）

`AppState` の `Mutex` は **同時に複数 lock を取る場合に必ず以下の順で取る**。
逆順で取ると別経路と組み合わせてデッドロックになる可能性がある。

```
project_path → config → tasks_cache → watcher_handle → write_ignore
```

`open_project_impl` の COMMITTING フェーズはこの順で全 lock を取得し、
`commit_app_state` の中で `project_path = Some(root)` を最初に書く。
失敗時は `Mutex` への書き込みを行わないため、`AppState` は IDLE / 旧 LOADED
のまま不変が保たれる。

---

## 7. sub-crate との境界

`spec-board-fs` (`src-tauri/crates/fs/`) は重い外部 crate（`walkdir` /
`notify` / `tempfile` 等）を集約するためのサブクレート。本リファクタでは
**sub-crate の API は一切変更しない**:

- 引数: `&Path` / `&str`
- 戻り値: `PathBuf` / `String` / `Vec<PathBuf>` / `Vec<String>`

VO は本体側に置き、`vo.as_str()` / `vo.as_path()` で sub-crate に渡す。
sub-crate からの戻り値（`PathBuf`）を本体側で
`TaskFilePath::from_relative_path(&path)?` で詰め直す。

これにより、サブクレート差し替えの影響範囲を狭く保ったまま、本体クレート
側で型による安全性を享受できる。

---

## 8. 残タスクとスコープ外

本リファクタでは以下を **スコープ外**としている:

- `priority` の VO 化（CreateTaskArgs の lenient 受け付けに影響するため）
- `TaskExtras` (`BTreeMap<String, serde_json::Value>`) のキー VO 化
- `WriteIgnoreRegistry` の絶対パス VO 化（`PathBuf` のまま）
- フロントエンド (`src/domains/`) との型同期（公開 API 不変のため自動互換）
- spec ドキュメント (`docs/spec-board/*`) の更新（仕様変更が無いため不要）
