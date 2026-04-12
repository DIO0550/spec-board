# spec-board

mdファイルベースのプロジェクト管理デスクトップアプリケーションです。  
Tauri + React で構築し、開発者とAIエージェントが同じデータソース（mdファイル）でタスクを管理できます。

## 含まれるツール

| カテゴリ | ツール / バージョン |
| --- | --- |
| OS | Ubuntu 24.04 |
| Node.js | v24 (nodesource) |
| パッケージマネージャー | pnpm |
| Rust | stable (`rustup`) |
| Tauri CLI | v2 (`@tauri-apps/cli` / Node ベース。必要に応じて `pnpm tauri` で利用) |
| バージョン管理 | Git |
| GitHub CLI | gh |
| テスト | Playwright (ブラウザ依存パッケージ込み) |
| ターミナル | tmux |

## VS Code 拡張機能

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) — 保存時に自動フォーマット

## 前提条件

- [Docker](https://www.docker.com/)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Dev Containers 拡張機能](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

## 使い方

1. このリポジトリを **Use this template** でコピー、またはクローンします。
2. VS Code でプロジェクトを開きます。
3. コマンドパレット (`F1`) → **Dev Containers: Reopen in Container** を選択します。
4. コンテナのビルドが完了すると、開発環境が利用可能になります。

ポート **4000** と **4001** がホストへ自動転送されます。

## プロジェクト構成

```
.devcontainer/
├── devcontainer.json   # Dev Container 設定
├── docker-compose.yml  # Docker Compose 定義
└── node/
    └── Dockerfile      # コンテナイメージ定義
```

## ライセンス

[MIT](LICENSE)
