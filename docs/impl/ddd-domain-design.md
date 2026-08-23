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

`struct TaskFilePath(String)` のような **1 フィールドの tuple newtype** は、
serde の `derive(Serialize, Deserialize)` だけでも JSON 上は内部値そのまま
（例: `"tasks/foo.md"`）にシリアライズされる。一方、

- 1 フィールドの **named** struct（`struct Foo { value: String }`）は、
  `#[serde(transparent)]` を付けないと `{"value": "tasks/foo.md"}` のような
  オブジェクト形になる。
- YAML タグやその他フォーマットでは、tuple newtype でもラッパが付くケースが
  ある。

本プロジェクトでは将来 `struct TaskFilePath { value: String }` に書き換えても
JSON 形状を保てるよう、また `serde_yaml_ng` などフォーマット差を吸収するため、
すべての VO に明示的に `#[serde(transparent)]` を付与している。これにより、

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
   - 例として、Aggregate `AppState` から `Task` を引くキーには将来的に VO
     `TaskFilePath` を使う形が望ましい。`Task` 自身を `AppState` の中に持つ
     わけではなく、別 Aggregate である `Task` 集合へのキーとして VO を保有
     する形になる。
   - 注: 現状の `src-tauri/src/state.rs` 実装では `AppState.tasks_cache` /
     `AppState.project_path` のキー型は `PathBuf` のまま据え置いている
     （本リファクタのスコープ外。詳細は §8 を参照）。

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
│  │  │ priority    : Option<      │  │    │   │  <String,* ※          │    │    │
│  │  │              Priority>     │  │    │   │   Vec<String>>* ※     │    │    │
│  │  │ body, extras, warnings ... │  │    │   └──────────────────────┘    │    │
│  │  └────────────────────────────┘  │    └──────────────────────────────┘    │
│  └────────┬─────────────────────────┘                                         │
│           │                                                                   │
│           ▼                                                                   │
│  ┌──────────────────────────────────┐    ┌──────────────────────────────┐    │
│  │  Aggregate: TaskIndex            │    │  Aggregate: AppState          │    │
│  │  ┌────────────────────────────┐  │    │  ┌────────────────────────┐   │    │
│  │  │ tasks: Vec<Task>           │  │    │  │ project_path : Mutex<   │   │    │
│  │  └────────────────────────────┘  │    │  │   Option<PathBuf>>* ※   │   │    │
│  │   - validate_parent_existence    │    │  │ config       : Mutex<   │   │    │
│  │   - validate_parent_hierarchy    │    │  │   Option<Config>>       │   │    │
│  │   - build_children               │    │  │ tasks_cache  : Mutex<   │   │    │
│  │   - build_reverse_links          │    │  │   HashMap<PathBuf,* ※   │   │    │
│  │   - resolve_parent_for_new_task  │    │  │             Task>>      │   │    │
│  │   - validate_chain_from_parent   │    │  │ watcher_handle: Mutex...│   │    │
│  └──────────────────────────────────┘    │  │ write_ignore: WriteIgn..│   │    │
│                                          │  └────────────────────────┘   │    │
│   ※ tasks_cache キー / project_path 値 / CardOrder のキー・値は本リファクタ  │
│   では String / PathBuf 据置（TaskFilePath / ColumnName / ProjectRoot への    │
│   置換は将来 PR の対象。詳細は §8 参照）                                      │
│                                                                              │
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
| `ColumnName` | `config::value_objects` | `String` + private state tag | 空文字不可 | あり（serde / IPC / frontmatter 境界の raw 値を保持） |
| `ProjectRoot` | `project::value_objects` | `PathBuf` | 空文字不可（実在性は別途検証） | なし（Tauri command 引数で `try_from_str` 明示） |

Map / Set のキーになる `TaskFilePath` / `ColumnName` のみ `PartialOrd, Ord`
を付与している（`BTreeMap` のキー、ソート用）。それ以外の VO は `Hash, Eq,
PartialEq` のみ。

`ColumnName` は raw 文字列に加えて `Lenient` / `Validated` の private state tag を持つ。
`try_from_str` は exact empty (`""`) だけを拒否し、空白のみや前後空白付きの値は
正規化せず `Validated` として保持する。serde deserialize、`From`、frontmatter 由来の
`Task.status` は `Lenient` で受け、config load の columns 非空・完全一致重複検査後に
`columns[].name` / `doneColumn` / `cardOrder` key を分類する。空文字だけは互換性のため
`Lenient` のまま残る。default、既存タスクからの bootstrap、reconcile、
`update_columns` の採用結果も同じ分類 helper を通る。

state tag は raw 値の出所情報であって値同一性ではない。`Serialize` / `Eq` / `Ord` /
`Hash` / `Borrow` / `Display` / `Debug` は raw `String` だけを使うため、state の違いは
JSON、config.json、ログ文字列、membership、done 判定、Map / Set key に現れない。
state と struct field は private で、外部 caller は `Validated` を直接生成できない。

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
   - TaskIndex::new(tasks).build_children()?.build_reverse_links().into_tasks()
   ↓
HashMap<PathBuf, Task> を AppState.tasks_cache に commit
   （tasks_cache のキーは本リファクタでは PathBuf 据置 — §8 参照。
    payload に詰め直す Task 内では `id` / `file_path` は TaskFilePath VO）
   ↓
OpenProjectPayload { tasks: Vec<Task>, columns: Vec<ColumnName> }
   ↓ (ColumnName の文字列 Serialize により JSON 形状不変)
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

- `AppState.project_path: Mutex<Option<PathBuf>>` の `ProjectRoot` 化
- `AppState.tasks_cache: Mutex<HashMap<PathBuf, Task>>` のキーの `TaskFilePath` 化
- `Config.card_order: BTreeMap<String, Vec<String>>` の VO 化
  （`BTreeMap<ColumnName, Vec<TaskFilePath>>` への置換）
- `priority` の VO 化（CreateTaskArgs の lenient 受け付けに影響するため）
- `TaskExtras` (`BTreeMap<String, serde_json::Value>`) のキー VO 化
- `WriteIgnoreRegistry` の絶対パス VO 化（`PathBuf` のまま）
- フロントエンド (`src/domains/`) との型同期（公開 API 不変のため自動互換）
- spec ドキュメント (`docs/spec-board/*`) の更新（仕様変更が無いため不要）

これらは公開 JSON 形状に影響しないため別 PR でインクリメンタルに置換可能。

---

## 9. task ドメインの内部分割

旧 `src-tauri/src/task/index.rs` (950L) と `src-tauri/src/task/create.rs` (564L) に
同居していた処理を、責務単位のサブモジュールへ分割した。1 ファイル
≤ 300L (実装) / ≤ 500L (テスト) を目安に、DDD 戦術的パターンを徹底する。

### 9.1 命名方針

技術カテゴリ的な抽象名 (`entity` / `aggregate` / `hierarchy` / `index`) を避け、
**ドメイン知識を表す名前**を採用する。parent 検証は `parent_validation`、
children 派生は `children`、Markdown → Task 変換は `parse`。`Task` struct は
それ自身を集約する `TaskIndex` aggregate と同じ `task_index.rs` に配置する
（aggregate root + entity の自然な単位）。`TaskIndex` 構造体名は domain 用語
として残るが、モジュール／フォルダ名としては `index` は使わない。

### 9.2 `task/` 直下フラット構成

Rust 2018+ の `mod.rs` を使わないモジュール記法に従い、親モジュールファイル
`task.rs` は `task/` フォルダの**兄弟**として `src-tauri/src/` 直下に置く。

```
src-tauri/src/
├── task.rs                      親モジュール（pub mod 列挙のみ）
└── task/
    ├── warning.rs               TaskWarning / TaskWarningCode
    ├── task_index.rs            Task entity + TaskIndex aggregate + parent チェーン不変条件の検証
    │                            (ParentHierarchyErrorReason / ParentValidationFailure を同居)
    ├── parse.rs                 task_from_markdown / TaskParseContext / TaskParseError
    ├── path_lookup.rs           normalize_*_for_lookup / task_*_index helper
    ├── children.rs              build_children (task_index の検証を委譲呼び出し)
    ├── reverse_links.rs         build_reverse_links + 関連 helper
    ├── task_content.rs          TaskContent VO (scanner eligible を constructor で強制)
    ├── task_file_name.rs        TaskFileName VO（変更なし）
    ├── task_file_path.rs        TaskFilePath VO（変更なし）
    ├── task_title.rs            TaskTitle VO（変更なし）
    ├── label.rs                 Label VO（変更なし）
    ├── frontmatter.rs           frontmatter parse / serialize（変更なし）
    ├── path_normalization.rs    pure string helper（変更なし）
    ├── get.rs                   get_tasks command（import パスのみ追従）
    └── create/                  サブモジュール群（9.3 参照、親 create.rs は task/ 直下）
```

依存方向の DAG:

```
        既存 VO群 / config / frontmatter
              │
              ▼
       warning  →  task_index (Task entity + TaskIndex aggregate
                                + 親チェーン不変条件の検証)
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
          parse   path_lookup   children / reverse_links
```

`children` / `reverse_links` / `path_lookup` の自由関数は `pub(super)` に統一し、
task ドメイン外（state / project / watcher_event）からは `TaskIndex` aggregate
のメソッド経由でのみアクセスする。親チェーンの検証ロジックは独立ファイルにせず、
`task_index.rs` 内に aggregate と同居させる（DDD 原則: validation は専用ファイル
ではなくドメインオブジェクトに紐づける。`create/validate.rs` を廃止して `TaskIndex`
に統合したのと同じ方針）。

### 9.3 `task/create/` サブモジュール

9.2 と同じく、親モジュールファイル `create.rs` は `create/` フォルダの**兄弟**
として `src-tauri/src/task/` 直下に置く。

```
src-tauri/src/task/
├── create.rs            親（pub mod 列挙 + pub use ファサード）
└── create/
    ├── args.rs          CreateTaskArgs DTO
    ├── error.rs         CreateTaskError / CreateTaskCommandError / ContentRejectReason
    │                    + From<ParentValidationFailure> for CreateTaskError
    ├── filename.rs      build_new_filename（TaskFileName::from_title へ委譲）/
    │                    resolve_target_dir / build_existing_filenames_in_dir / join_rel_path
    ├── content.rs       build_task_content（TaskContent VO を返す factory）
    │                    + private render_markdown
    └── command.rs       create_task (#[tauri::command]) / create_task_impl /
                         provisional_task / parse_and_insert_into_cache
```

`validate.rs` は**作らない**。validation は「ドメインオブジェクトに紐づける」
DDD 原則に従い、新規 task の parent 検証は `TaskIndex::validate_new_parent`
／`TaskIndex::validate_with_new_task` の aggregate メソッドに集約した。

旧 `validate_content_scanner_eligibility` は新 VO `TaskContent::try_new` の
constructor で強制するように吸収した（不正値が型レベルで cache / FS へ流れ
込まない）。

### 9.4 Rust 初心者向けメモ

- **`pub(super)`**: 親モジュール（と、その全 descendants）からのみ可視。`pub` より
  狭く、private より広い。task ドメイン内 helper を sibling から呼びたいが crate 外
  へは漏らしたくない、というケースに使う。
- **`#[path] mod xxx_tests;`**: `xxx.rs` の兄弟ファイルとして配置した `xxx_tests.rs`
  を test 子モジュールとして取り込む宣言。`mod.rs` を使わない 2018+ スタイル。
- **`From<ParentValidationFailure> for CreateTaskError`**: domain エラーから
  application エラーへの自動変換。`command.rs` 内で `index.validate_new_parent(...)?`
  と書くだけで `?` operator が chain を自動処理する。
- **`TaskContent::try_new`**: smart constructor パターン。invalid な値で構築する
  経路を構造的に塞ぐ。`build_task_content(&args, parent)?` の結果をそのまま
  `file.write_all(content.as_bytes())` に渡せる。
