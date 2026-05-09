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
    lib.rs              — モジュール公開（frontmatter のみ）
    frontmatter.rs      — md フロントマターのパース / シリアライズ
  crates/
    fs/                 — spec-board-fs crate（重い外部 crate を集約するサブクレート）
      Cargo.toml        — package=spec-board-fs / walkdir + thiserror + dev:tempfile
      src/
        lib.rs          — `pub mod file_scanner;` + 配置基準 doc コメント
        file_scanner.rs — `walkdir` ベースの再帰スキャン
```

### フロントエンド構成ルール

- 機能は `src/features/<feature-name>/` 配下にまとめる
- feature間の依存は `index.ts` の公開APIを通じてのみ行う（内部ファイルを直接importしない）
- 複数featureで共有するものは `src/components/`, `src/hooks/`, `src/types/`, `src/lib/` に置く
- featureディレクトリ内のサブフォルダは必要になった時点で作成する（先に空フォルダを作らない）

### Rust バックエンド構成ルール

`src-tauri/crates/fs/`（サブクレート `spec-board-fs`）は **重い外部 crate に依存する処理を集約**するためのサブクレート。Cargo.toml レベルで依存を分離することで、外部ライブラリ差し替えの影響を 1 箇所に閉じ込めることが目的。本体クレート `spec-board` は `path = "crates/fs"` 経由でのみ参照する。

- **集約する**: 重い I/O / 走査 / OS 依存 / ネットワーク等を伴う crate
  - 例: `walkdir`（再帰走査）、`notify`（ファイル監視。Issue で予定）、`reqwest`（HTTP）
- **集約しない**（本体 crate に直接置いてよい）: Rust エコシステムで事実上標準の型変換・派生系
  - 例: `serde` / `serde_json` / `serde_yaml_ng` / `thiserror` / `anyhow`
- **境界の漏出禁止**: `spec-board-fs` の各モジュールは `pub` API の型シグネチャに外部 crate の型を出さない（`std` の型と独自エラー型のみ）
  - 例: `walkdir::DirEntry` を返さず `Vec<PathBuf>` で返す、`walkdir::Error` を `std::io::Error` に詰め直す
- **tauri 非依存**: `spec-board-fs` は `tauri` に依存しない（IPC コマンド層は本体クレート側に置く）
- 将来サブモジュールを追加する場合は flat 配置（`{name}.rs` + `{name}/` 子フォルダ形式）を推奨

## コンポーネント・フック・ライブラリ規約

### 宣言

- 宣言はアロー関数 + named export を基本とする。`export default` は禁止。
  - 例外: `src/App.tsx`（ルートコンポーネント）は named export だがフォルダ化対象外。
- Props は `type XxxProps = {...}` を定義し、`const Xxx = (props: XxxProps) => {...}` で受ける。
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

`docs/spec-board/` が「**何を**実現するか（仕様 / 公開 API）」を記すのに対し、`docs/impl/` は「**なぜそう書いたか / どう動いているか**（実装方針）」を記す場所として運用する。仕様書だけでは伝わらない設計判断・トレードオフ・前提知識を、後から読む人（自分自身を含む）が辿れるようにする。

### 配置と命名

- 配置: `docs/impl/{対象名}.md`
  - 1 モジュール = 1 ファイルが基本（例: `docs/impl/watcher.md`、`docs/impl/config-io.md`）
  - サブモジュールが多くなったらフォルダに昇格してよい（例: `docs/impl/watcher/{topic}.md`）
- 命名: kebab-case。Rust モジュール名や TypeScript feature 名と一致させる
- 仕様書 (`docs/spec-board/*.md`) との関係は冒頭で明示する（「仕様面は X を参照、本ガイドは実装面を扱う」）

### 作成すべきタイミング

以下のいずれかに該当する場合、実装ガイドを `docs/impl/` に作成する:

- 新規モジュール追加で、設計判断（外部 crate 選定、フォールバック戦略、スレッドモデル、エラー型方針など）が複数発生した
- 自明でない並行性／非同期挙動（`Drop` 順序、チャネル切断連鎖、ロック取り順）を含む
- セキュリティ上の対処（TOCTOU・XSS・インジェクション）を実装に組み込んだ
- 1 つのモジュールに対して、コード行数より背景説明（why）の方が長くなる規模の実装

軽微な変更（リファクタリング、命名変更、定数調整など）では作成不要。

### 必ず含める要素

1. **冒頭サマリ**: 対象ファイルと、本ガイドの位置付け（仕様書との役割分担）
2. **全体像**: データフロー図 / コンポーネント関係図（ASCII でも Mermaid でも可）
3. **採用クレート / ライブラリと選定理由**: なぜそれを選んだか、代替案を退けた理由
4. **設計判断の根拠**: 「なぜこの構造にしたか」「素直に書くとどう破綻するか」
5. **並行性・ライフサイクル**: スレッド / `Drop` 順序 / チャネル / ロック順
6. **セキュリティ・健全性**: race / リーク / panic 安全性などへの対処
7. **テスト戦略**: TDD・パラメタライズド・ヘルパー責務・OS 依存の切り離し
8. **プロジェクト規約との対応**: CLAUDE.md の規約をどう満たしているか
9. **スコープ外**: 本実装で扱わないこと（後続 Issue・別ドキュメントへの誘導）

### 書き方の方針

- **「なぜ」を書く**: 「何をしているか」はコードを読めば分かる。実装ガイドは「なぜそう書いたか」「素直な書き方が何故ダメだったか」「代替案をなぜ退けたか」を残す
- **言語基礎を必要に応じて補う**: 読者が言語の経験者とは限らない（特に Rust は学習コストが高い）。`Option<T>` / 所有権 / `FnOnce` / `Send` 等、初学者が引っかかる用語は **本ガイド内で軽く補足する** か、巻末に用語リファレンスを置く
- **コード片を引用する**: 該当ロジックは `rust` / `ts` 等のコードブロックで引用し、その上で「ここがポイント」を解説する。コードと文章を行き来できるようにする
- **比較表を活用する**: 選択肢が複数ある場合（例: `Option` vs `Result`、`Recommended` vs `Poll`、API a vs API b）はテーブルで対比する
- **コメントに spec ID を書かない規約はガイド側でも維持**: 仕様書（`docs/spec-board/`）への自然文リンクで参照し、`PL-XXX` 等の内部 ID は実装ガイドにも書かない
- **仕様変更時の追従義務**: 実装ガイドが古くなると有害なため、対応する `docs/spec-board/` を更新する PR では実装ガイドも同 PR で更新する。乖離している場合は **コードと仕様書を信頼の source of truth とし、実装ガイドを追従させる**

### PR との連動

- 新規モジュール追加 PR: `docs/impl/{name}.md` を同 PR に含める。PR 本文の「変更の種類」に `📝 Doc` を追加し、「レビューポイント」で「実装ガイド追加」を明記する
- 既存モジュールの大規模改修 PR: 変更箇所に対応するガイドの章を更新する。差分が大きい場合は別コミットに分けて読みやすくする
- 軽微な改修で実装ガイド更新が不要なときは、PR 本文または commit メッセージにその旨を明記する
