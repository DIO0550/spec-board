# Tauri setup commands

Dev Container に入った状態で、リポジトリの root から実行します。

## React + TypeScript でひな形を作る

```bash
pnpm create tauri-app@latest . \
  --template react-ts \
  --manager pnpm \
  --identifier io.github.dio0550.specboard \
  --yes \
  --force
```

## 開発起動

```bash
pnpm tauri dev
```

Vite の開発サーバーは **4000**、HMR は **4001** を使います。

## ビルド

```bash
pnpm tauri build
```
