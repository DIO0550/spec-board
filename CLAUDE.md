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
  lib/                  — アプリ共通のライブラリ
  assets/               — 静的アセット
src-tauri/              — Tauri (Rust) バックエンド
```

### フロントエンド構成ルール

- 機能は `src/features/<feature-name>/` 配下にまとめる
- feature間の依存は `index.ts` の公開APIを通じてのみ行う（内部ファイルを直接importしない）
- 複数featureで共有するものは `src/components/`, `src/hooks/`, `src/types/`, `src/lib/` に置く
- featureディレクトリ内のサブフォルダは必要になった時点で作成する（先に空フォルダを作らない）

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
memory に過去の内容があっても省略せず、必ず Skill ツールで最新版を読み込むこと。

- 実装開始時は `implementation-workflow` スキルを Skill ツールで実行し、フローに従う
- コーディング中は `coding-standards` スキルを Skill ツールで実行
- テスト作成時は `tdd` および `testing` スキルを Skill ツールで実行
- コードレビュー時は `typescript-code-review-skill` スキルを Skill ツールで実行
- パフォーマンス確認時は `typescript-performance-review-skill` スキルを Skill ツールで実行

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
