# Storybook Visual Regression

spec-viewer と同じ構成の Storybook visual regression を採用している。

## 構成

1. `pnpm build-storybook` で静的 Storybook をビルドする
2. `pnpm visual:capture` で Chrome CDP 経由に各 story の PNG を取得する
3. `pnpm visual:compare` で `odiff-bin` により baseline と比較し、HTML レポートを生成する

baseline は `gh-pages/visual-baseline/` に保存する。PR では `gh-pages/visual-regression/pr-{N}/` にレポートを公開する。

## CI

- `.github/workflows/storybook-visual-regression.yml` — PR で capture / compare / レポート公開 / sticky comment
- `.github/workflows/deploy-storybook-main.yml` — `main` で Storybook と baseline を更新

## ローカル実行

```bash
pnpm build-storybook
pnpm visual:capture -- --storybook-dir storybook-static --out visual-actual
pnpm visual:compare -- --expected visual-baseline --actual visual-actual --out visual-report
```

ローカルで `visual:capture` を実行するには Google Chrome / Chromium が必要。`CHROME_BIN` で実行ファイルを指定できる。
