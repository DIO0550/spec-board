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
