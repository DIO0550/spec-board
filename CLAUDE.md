# spec-board

Tauri v2 + React 19 + TypeScript のデスクトップアプリケーション。

## 技術スタック

- **フロントエンド**: React 19, TypeScript 5.8, Vite 8
- **デスクトップ**: Tauri v2 (Rust)
- **テスト**: Vitest 4, happy-dom
- **リンター/フォーマッター**: Biome 2, oxlint
- **パッケージマネージャー**: pnpm

## コマンド

- `pnpm dev` — 開発サーバー起動
- `pnpm build` — TypeScriptビルド + Viteビルド
- `pnpm test` — テスト実行（watchモード）
- `pnpm test:run` — テスト実行（1回のみ）
- `pnpm tauri dev` — Tauriアプリ起動（開発）
- `pnpm tauri build` — Tauriアプリビルド

## ディレクトリ構成

```
src/                    — React フロントエンド
  features/             — 機能単位のモジュール（featureベース）
    <feature-name>/
      components/       — feature固有のコンポーネント
      hooks/            — feature固有のカスタムフック
      types/            — feature固有の型定義
      lib/              — feature固有のライブラリ（API クライアント、ドメインロジック等）
      index.ts          — 公開API（re-export）
  components/           — アプリ共通のUIコンポーネント
  hooks/                — アプリ共通のカスタムフック
  types/                — アプリ共通の型定義
  lib/                  — アプリ共通のライブラリ（API クライアント、外部 SDK ラッパ等のアプリ固有ロジック）
  utils/                — 汎用ユーティリティ（`Result<T, E>` / `Option<T>` などフレームワーク非依存のプリミティブ）
  domains/              — ドメイン型（`Priority` 等）+ companion API
  assets/               — 静的アセット
src-tauri/              — Tauri (Rust) バックエンド (Cargo workspace ルート)
  Cargo.toml            — `[workspace] members=[".", "crates/fs"]` + spec-board package
  src/                  — spec-board crate（本体）
    main.rs             — エントリーポイント
    lib.rs              — `pub mod` 列挙: `config` / `project` / `state` / `task` / `watcher_event`
    config.rs           — config ドメイン親（`pub mod` 列挙 + `pub use` 再エクスポートのみ）
    config/
      core.rs           — `Config` / `Column` / `ColumnColor` / `CardOrder` などコアスキーマ型 + GUIDE.md 生成 / `update_columns` 純粋計算 / `build_config_from_statuses` 等
      migration.rs      — `config.json` の `version` マイグレーションフック（`MigrationError` / `migrate_config`）
      load.rs           — `.spec-board/config.json` の読み込み（`load_or_default` / `LoadConfigError`）+ atomic write インフラ（`ConfigWriter` / `FsConfigWriter` / `write_atomic_to_path`）
      label_registry.rs — ラベルマスタ（`labels.yml`）のドメイン型 / aggregate / 永続化 store
      milestone_registry.rs — マイルストーンマスタ（`milestones.yml`）のドメイン型 / aggregate / 永続化 store
      config_tests.rs   — `core` / `migration` / `load` のユニットテスト
      label_registry_tests.rs — `label_registry` のユニットテスト
      milestone_registry_tests.rs — `milestone_registry` のユニットテスト
    state.rs            — `AppState` / lock 取得順序契約（テスト: `state/state_tests.rs`）
    state/
      state_tests.rs    — `state.rs` のユニットテスト
    task.rs             — task ドメイン親（`pub mod create; pub mod frontmatter; pub mod get; pub mod warning; pub mod task_index; pub mod parse; pub mod parent_validation; pub mod children; pub mod reverse_links; pub mod path_lookup; pub mod task_content; ...`）
    task/
      create.rs         — `task::create` ファサード（`pub mod` 列挙 + `pub use` のみ）
      create/
        args.rs                — `CreateTaskArgs` DTO（+ 直下 helper のみ、テストなし）
        command.rs             — `create_task` Tauri command + `create_task_impl` effect 層
        command_tests.rs       — `task::create::command` のテスト（E2E 16 件）
        content.rs             — `build_task_content`（`TaskContent` VO factory）
        content_tests.rs       — `task::create::content` のテスト（4 件）
        error.rs               — `CreateTaskError` / `CreateTaskCommandError` / `ContentRejectReason` + `From<ParentValidationFailure>`
        filename.rs            — `build_new_filename`（`TaskFileName` VO 委譲）+ `resolve_target_dir` 等
        filename_tests.rs      — `task::create::filename` のテスト（9 件）
      frontmatter.rs    — md フロントマターのパース / シリアライズ
      frontmatter_tests.rs — `task::frontmatter` のテスト
      get.rs            — `get_tasks` Tauri command 実装
      get_tests.rs      — `task::get` のテスト
      warning.rs        — `TaskWarning` / `TaskWarningCode`
      task_index.rs     — `Task` entity + `TaskIndex` aggregate + parent チェーン不変条件の検証ロジック（`ParentHierarchyErrorReason` / `ParentValidationFailure` 含む。DDD 原則に従い validation は aggregate に同居させる）
      task_index_tests.rs — `task::task_index` の aggregate / entity 関連テスト
      task_index_parent_chain_tests.rs — `task::task_index` の親チェーン検証テスト
      parse.rs          — `task_from_markdown` / `TaskParseContext` / `TaskParseError`
      parse_tests.rs    — `task::parse` のテスト
      children.rs       — `build_children`（parent_validation 委譲）
      children_tests.rs — `task::children` のテスト
      reverse_links.rs  — `build_reverse_links` + 関連 helper
      reverse_links_tests.rs — `task::reverse_links` のテスト
      path_lookup.rs    — task path 引き当て用 helper（`pub(super)` で task ドメイン内に閉じる）
      task_content.rs   — `TaskContent` VO（scanner eligible を constructor で強制）
      task_content_tests.rs — `task::task_content` の境界テスト
    project.rs          — project ドメイン親（`pub mod open;`）
    project/
      open.rs           — `open_project` Tauri command 実装
      open_tests.rs     — `project::open` のテスト
    watcher_event.rs    — watcher イベント adapter（FsEvent → IPC emit）
    watcher_event/
      handler.rs        — 1 件分の `FsEvent` 処理ロジック
      tests.rs          — adapter のテスト
  crates/
    fs/                 — spec-board-fs crate（重い外部 crate を集約するサブクレート）
      Cargo.toml        — package=spec-board-fs / walkdir + notify + thiserror + dev:tempfile
      src/
        lib.rs          — `pub mod` 列挙: `config` / `task` / `watcher` の 3 ドメイン
        task.rs         — task ドメイン親（`pub mod file_scanner; pub mod kebab_case; pub mod unique_filename;`）
        task/
          file_scanner.rs       — `walkdir` ベースの再帰スキャン（+ `_tests.rs`）
          kebab_case.rs         — タイトル → kebab-case 変換（+ `_tests.rs`）
          unique_filename.rs    — 衝突回避ファイル名生成（+ `_tests.rs`）
        watcher.rs      — watcher ドメイン親（`pub mod core; pub mod handle; pub mod write_ignore;`）
        watcher/
          core.rs               — `notify` ベースの Watcher 本体（+ `_tests.rs`）
          handle.rs             — `WatcherHandle` トレイト + Noop 実装（+ `_tests.rs`）
          write_ignore.rs       — 自前 write 由来 event を抑止するレジストリ（+ `_tests.rs`）
        config.rs       — config ドメイン親（`pub mod config_io;`）
        config/
          config_io.rs          — `.spec-board/config.json` 読み書き + GUIDE.md 出力（+ `_tests.rs`）
```

### フロントエンド構成ルール

- 機能は `src/features/<feature-name>/` 配下にまとめる
- feature間の依存は `index.ts` の公開APIを通じてのみ行う（内部ファイルを直接importしない）
- 複数featureで共有するものは `src/components/`, `src/hooks/`, `src/types/`, `src/lib/` に置く
- featureディレクトリ内のサブフォルダは必要になった時点で作成する（先に空フォルダを作らない）

### Rust バックエンド構成ルール

`src-tauri/crates/fs/`（サブクレート `spec-board-fs`）は **重い外部 crate に依存する処理を集約**するためのサブクレート。Cargo.toml レベルで依存を分離することで、外部ライブラリ差し替えの影響を 1 箇所に閉じ込めることが目的。本体クレート `spec-board` は `path = "crates/fs"` 経由でのみ参照する。

- **集約する**: 重い I/O / 走査 / OS 依存 / ネットワーク等を伴う crate
  - 例: `walkdir`（再帰走査）、`notify`（ファイル監視）、`reqwest`（HTTP）
- **集約しない**（本体 crate に直接置いてよい）: Rust エコシステムで事実上標準の型変換・派生系
  - 例: `serde` / `serde_json` / `serde_yaml_ng` / `thiserror` / `anyhow`
- **境界の漏出禁止**: `spec-board-fs` の各モジュールは `pub` API の型シグネチャに外部 crate の型を出さない（`std` の型と独自エラー型のみ）
  - 例: `walkdir::DirEntry` を返さず `Vec<PathBuf>` で返す、`walkdir::Error` を `std::io::Error` に詰め直す
- **tauri 非依存**: `spec-board-fs` は `tauri` に依存しない（IPC コマンド層は本体クレート側に置く）

#### モジュール記法（Rust 2018+ 新スタイル）

両クレートとも `mod.rs` を**一切使用しない**。ドメイン親ファイルは `xxx.rs`（`pub mod` 列挙のみ）、子モジュールは同名フォルダ内 `xxx/yyy.rs`（兄弟配置）。

- 例: `src/task.rs`（親、`pub mod create; pub mod frontmatter; ...`）+ `src/task/create.rs`（子）
- 単一ファイルドメイン（`src/state.rs` / `src/config.rs`）は親フォルダを作らずフラット配置のまま。テスト切り出しが必要な場合のみ `src/state/state_tests.rs` のように兄弟フォルダを併設する

#### 中粒度ドメイン構成

- **本体クレート `src-tauri/src/`**: `task` / `project` / `watcher_event` / `config` / `state` の 5 ドメイン
- **サブクレート `src-tauri/crates/fs/src/`**: `task` / `watcher` / `config` の 3 ドメイン
  - `watcher` 配下は `core` / `handle` / `write_ignore` の 3 子モジュール（旧 `watcher.rs` → `watcher/core.rs`、旧 `watcher_handle.rs` → `watcher/handle.rs` にリネーム済み。`watcher::watcher` のような冗長表現を避けるため）

#### テスト配置

- `#[cfg(test)] mod tests { ... }` インラインは**禁止**。同階層に `{basename}_tests.rs` を切り出して `mod` 宣言で読み込む
- 親ファイルが `xxx.rs` で子テストが同階層 `xxx_tests.rs` の場合（兄弟配置）は `#[cfg(test)] #[path = "xxx_tests.rs"] mod xxx_tests;` のように **`#[path]` 属性が必須**
- 親ファイルが上位 `xxx.rs` で子テストが `xxx/xxx_tests.rs` の場合（親+子フォルダ）は `#[cfg(test)] mod xxx_tests;` のみで OK（標準解決）

## コンポーネント・フック・ライブラリ規約

### 宣言

- 宣言はアロー関数 + named export を基本とする。`export default` は禁止。
  - 例外: `src/App.tsx`（ルートコンポーネント）は named export だがフォルダ化対象外。
- Props は `type XxxProps = {...}` を定義し、`const Xxx = ({ ... }: XxxProps) => {...}` で分割代入して受けることを基本とする（引数を `props` でまとめて受けてもよい）。
- `React.FC` / `FunctionComponent` は使用しない。

### フォルダ構造

- コンポーネント / カスタムフック / `src/lib/` 配下のモジュールは `{Name}/index.{ts,tsx}` に配置する。
- テストは同階層の `__tests__/` 配下に置く。
- テスト命名:
  - 単一カテゴリのみ: `__tests__/index.test.{ts,tsx}`
  - カテゴリ別複数: `__tests__/{対象名}.{カテゴリ}.test.{ts,tsx}`（例: `Board.rendering.test.tsx`, `Column.interaction.test.tsx`）
- invoke ラッパ (`src/lib/tauri/`) は **1 関数 = 1 フォルダ + `index.ts`** 構成に統一する。
  - 配置: `src/lib/tauri/{feature}/{functionName}/index.ts`（フォルダ名は camelCase で関数名と一致）。
  - 共通型: feature 内で公開する型は原則 `src/lib/tauri/{feature}/types.ts` に集約する。関数 1 本のみの feature では `types.ts` を作らず関数ファイルへの同居も可。
  - feature 単位の barrel (`{feature}/index.ts`) は作成せず、`src/lib/tauri/index.ts` を唯一の公開 API とする。
  - 関数ファイル / `types.ts` から root barrel `@/lib/tauri` を import してはならない（循環参照防止）。`invokeWrapped` / `tauriError` への参照は個別 alias (`@/lib/tauri/invokeWrapped`, `@/lib/tauri/tauriError`) を使い、同 feature 内 `types.ts` は隣接相対 (`../types`) で参照する。
- 例外:
  - `src/App.tsx` はルートコンポーネントとしてフラット配置を維持する。
  - `src/types/*.ts` は型定義ファイルのためフォルダ化対象外。

### import パス

- `@/` alias を使用する（`tsconfig.json` / `vite.config.ts` に設定済み）。
  - 深い相対パス（`../../../foo`）は `@/foo` に統一する。
  - 同一ディレクトリ内や隣接フォルダ（`./Name` / `../Name`）は相対のまま可。
- import 先はフォルダ名までを推奨（`@/components/ConfirmDialog` 等。末尾の `/index` は書かない）。

### Storybook

- 将来導入時は `__tests__/index.stories.tsx`（または `{対象名}.stories.tsx`）に配置する（現時点は未導入）。

## TypeScript 開発ルール

TypeScript コードを変更するすべての作業で、以下のスキルを **Skill ツールで実行**すること。
`.claude/projects/**/memory/` のメモリに過去の内容があっても省略せず、必ず Skill ツールで最新版を読み込むこと。

| タイミング | スキル | 呼び出し方 |
|:--|:--|:--|
| 実装開始時 | `implementation-workflow` | `/implementation-workflow` |
| コーディング中 | `coding-standards` | `/coding-standards` |
| テスト作成時 | `tdd` | `/tdd` |
| テスト作成時 | `testing` | `/testing` |
| コードレビュー時 | `typescript-code-review-skill` | `/typescript-code-review-skill` |
| パフォーマンス確認時 | `typescript-performance-review-skill` | `/typescript-performance-review-skill` |

## Rust 開発ルール

### スキルの呼び出し方法（必須）

スキルを「参照」する際は、必ず Skill ツール（`/スキル名` コマンド）を使用してスキルの内容をロードすること。
スキルの名前を知っているだけでは不十分であり、実際に Skill ツールを呼び出してスキル定義を読み込むこと。

> **禁止**: スキル名を記憶だけで参照し、Skill ツールを呼び出さずに作業を進めること
>
> **必須**: 該当スキルを Skill ツールで呼び出し、ロードされた内容に従って作業すること

### メモリの読み込み（必須）

作業開始時に `.claude/projects/` 配下の `memory/` ディレクトリを必ず確認し、メモリファイルが存在する場合はすべて読み込むこと。
メモリが存在するかどうかに関わらず、必ず確認を行うこと。メモリが存在する場合は、関連性の有無を問わずすべて読み込む。

> **禁止**: メモリが無いと仮定して確認をスキップすること
>
> **禁止**: 「関連がなさそう」と判断してメモリの読み込みをスキップすること
>
> **必須**: 毎回メモリディレクトリを確認し、存在するファイルはすべて読み込むこと

### スキル参照ガイド

Rust コードを変更するすべての作業で、以下のスキルを Skill ツールで呼び出すこと。

| タイミング | スキル | 呼び出し方 |
|:--|:--|:--|
| 実装開始時 | `implementation-workflow` | `/implementation-workflow` |
| コーディング中 | `coding-standards` | `/coding-standards` |
| テスト作成時 | `tdd` | `/tdd` |
| テスト作成時 | `testing` | `/testing` |

## 仕様変更時のドキュメント更新

- 仕様（公開API、データ形式、画面挙動、設定項目など）が変わった場合は、`docs/spec-board/` 配下の該当 spec ドキュメント（`task-format-spec.md` / `board-view-spec.md` / `file-system-spec.md` / `task-card-spec.md` / `config-spec.md` / `index.md` 等）を必ず同じ PR で更新する。
- spec ドキュメントとコードの実装が乖離した場合は、ドキュメント側を信頼の source of truth として扱い、コード変更時に追従させる。
- ドキュメント更新が不要な実装変更（純粋なリファクタリング、内部実装の最適化など）は、その旨を PR 説明や commit メッセージで明記する。

## 実装ガイドの作成（`docs/impl/`）

仕様（何を実現するか）は `docs/spec-board/`、実装方針（なぜそう書いたか）は `docs/impl/{対象名}.md` に書く。

- **読者は Rust 初心者である前提で書く**。所有権・`Option`・`FnOnce`・`Drop` 順序など、初学者が引っかかる概念は都度補足する
- 形式や項目立てに決まったテンプレートは設けない。設計判断の根拠が伝わればよい
