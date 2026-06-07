# 実装メモ: IDEシェル（サイドバー / ビュー切替 / 検索フィルタ / 外観）

Issue #264。ボード画面に IDE 風のシェル要素を載せた。仕様（何を実現するか）は
[board-view-spec.md](../spec-board/board-view-spec.md) の「IDEシェル」節を参照。ここでは
「なぜそう実装したか」を残す。

## 全体方針: バックエンド非変更・FE 完結

サイドバーの最近開いた一覧・ファイルツリー・ビュー切替・外観設定はすべて
**フロントエンドだけ**で完結させた。理由:

- ファイルツリーは既にロード済みの `tasks[].filePath` から導出できる。実ディレクトリを
  走査する Rust コマンドを足す必要がない（その分 spec が「タスクファイル由来のツリー」に
  限定される。全ファイル走査が要るなら別 Issue）。
- 最近開いた一覧・テーマ・ビュー形態は「端末固有の UI 設定」で、プロジェクト（リポジトリ）に
  混ぜたくない。よって `.spec-board/config.json` ではなく `localStorage`（`spec-board:*`）に置いた。

## 外観テーマ: セマンティック CSS 変数トークン

ダークモードを「全コンポーネントに `dark:` バリアントを足す」方式にすると変更が広範で漏れやすい。
代わりに **意味トークン**（`--color-surface` / `--color-foreground` / `--color-accent` …）を
Tailwind v4 の `@theme` で定義し、各コンポーネントは `bg-surface` / `text-foreground` のような
ユーティリティを使う（`src/index.css`）。

- Tailwind v4 は `@theme` の `--color-*` から `bg-*` 等のユーティリティを生成し、それらは
  `var(--color-*)` を参照する。よって `:root[data-theme="dark"] { --color-surface: … }` のように
  **変数値を属性セレクタで上書き**するだけで、ユーティリティ側を一切触らずに実行時テーマ切替ができる。
- アクセントの薄色は `--color-accent-soft: color-mix(in srgb, var(--color-accent) 14%, transparent)` と
  し、アクセント変更に自動追従させた（テーマ × アクセントの組合せ爆発を避ける）。
- 密度は `:root[data-density="compact"] { font-size: 14px }`。Tailwind の間隔・文字は rem 基準なので
  ルート `font-size` を変えるだけで全体が一括スケールする。
- 既存コンポーネントの直書き色（`bg-white` / `text-gray-*` / `bg-blue-*`）はこのトークンへ機械的に
  置換した。状態色（red/green/amber）とラベルのマスタ定義色（インライン `style`）はテーマ非依存なので
  据え置いた。

`ThemeProvider`（`src/features/shell/hooks/useTheme`）が `appearance` state を持ち、変更時に
`localStorage` 保存と `documentElement` の `data-*` 属性反映を行う。`system` 選択時は
`matchMedia('(prefers-color-scheme: dark)')` を購読して OS 設定の変化にも追従する。

> React の補足: `ThemeProvider` は App ルート（`App.tsx`）で全体をラップしている。`useTheme` は
> Provider の外で呼ぶと例外を投げる契約なので、`HeaderBar` を単体テストする際は
> `ThemeProvider` でラップしている。

## フィルタを「持ち上げた」理由

以前は `Board` 内部に `useMilestoneFilter` と絞り込み UI が同居していた。リスト/ツリー/カレンダーの
各ビューでも同じ絞り込みを共有したいので、**フィルタを `BoardWorkspace`（新コンテナ）へ持ち上げた**。

- `BoardWorkspace` が `useTaskFilter(tasks)` を持ち、絞り込み済み `filtered` を全ビューへ配る。
- `Board` は絞り込み済み `tasks` を受け取るだけにし、内部フィルタを撤去した。ただし子孫カウント
  （サブ Issue 進捗）は**絞り込み前の全タスク**で解決する必要があるため、`allTasks` を別に受け取る
  props を追加した（`tasks` が減っても `allTasks` でカウントは正確なまま）。
- 絞り込みの純ロジックは `applyTaskFilter`（`src/features/board/lib/applyTaskFilter`）に切り出し、
  AND 結合・各軸 OR・キーワード部分一致をユニットテストで担保した。UI とフックは薄い配線に留めている。

## TabNav 汎用化は「受け皿の提供」までで、settings/SubNav は据え置き

ビュー切替サブバーのために汎用 `TabNav`（`src/components/TabNav`）を新設したが、既存の
`settings/SubNav` は **TabNav へ移行せず据え置いた**。当初は「SubNav を TabNav に統合して
重複排除」も検討したが、SubNav は `settings-tab-*` / `settings-panel-*` という DOM id 規約に
依存した既存テスト群を持つため、移行すると回帰リスクとテスト改修コストが上振れする。

汎用抽出の主目的は「横断再利用の受け皿を用意すること」であり、それは `BoardWorkspace` が
`TabNav` を採用した時点で達成済み。SubNav と TabNav は tablist の描画規約こそ似ているが、
**設定タブ**と**ボードのビュー切替**は別ドメイン概念で別々に変化しうるため、現時点の軽微な
重複は意図的に許容する（将来 settings に手を入れる際に TabNav へ寄せる余地は残す）。

## ビュー別ロジックも純関数へ

ツリー構築（`buildTaskTree`）・カレンダーの月グリッド（`calendarMonth`）・ファイルツリー構築
（`buildFileTree`）は副作用のない純関数として切り出し、コンポーネントは描画と局所 state
（展開折りたたみ・表示月）だけを持たせた。これにより境界値（孤立ノード・月初の曜日詰め・
期限なしの振り分け・パス表記揺れ）をコンポーネントを描画せずに検証できる。
