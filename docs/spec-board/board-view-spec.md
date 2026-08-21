# spec-board - ボードビュー仕様（フロントエンド）

> **機能**: [spec-board](./index.md)
> **ステータス**: 下書き

## 概要

カンバン風のボードUIを提供し、タスクをステータス別のカラムに表示する。カラムはユーザーが自由に定義・編集でき、ドラッグ&ドロップでタスクのステータスを変更できる。

## レイアウト

```
┌──────────────────────────────────────────────────────────┐
│  spec-board   [プロジェクト名]            [設定] [開く]    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─── Todo ───┐  ┌ In Progress ┐  ┌─── Done ───┐       │
│  │ [+ 追加]   │  │ [+ 追加]    │  │ [+ 追加]   │  ...  │
│  │            │  │             │  │            │       │
│  │ ┌────────┐ │  │ ┌─────────┐ │  │ ┌────────┐ │       │
│  │ │カード1  │ │  │ │カード3   │ │  │ │カード5  │ │       │
│  │ └────────┘ │  │ └─────────┘ │  │ └────────┘ │       │
│  │ ┌────────┐ │  │ ┌─────────┐ │  │            │       │
│  │ │カード2  │ │  │ │カード4   │ │  │            │       │
│  │ └────────┘ │  │ └─────────┘ │  │            │       │
│  │            │  │             │  │            │       │
│  └────────────┘  └─────────────┘  └────────────┘       │
│                                                          │
│  [+ カラムを追加]                                         │
└──────────────────────────────────────────────────────────┘
```

## コンポーネント

| コンポーネント | 種別 | 説明 | 振る舞い |
|:-------------|:-----|:-----|:---------|
| ヘッダーバー | ナビゲーション | 48px の共通 topbar。プロジェクト選択時は brand、プロジェクト名 / path breadcrumb、同期状態（`監視 N files`）を表示する。設計chromeではボード上に検索・ラベル・設定・開く・新規タスクを右寄せし、テーマ切替・マイルストーン・GUIDE.md は補助 API として保持するが表示しない | 設定アイコンで設定画面へ切り替え、ラベルアイコンでラベル設定へ入る。設定 / マイルストーン画面では同期状態と検索のみを表示し、設定サブナビを使う。ボードの「開く」「新規タスク」は従来どおりプロジェクト選択・作成画面へ遷移する |
| カラム | コンテナ | ステータスに対応する縦列。ヘッダーにステータス名とタスク数、下部に「タスクを追加」導線を表示 | ドロップ先として機能。カラム内でのカード並び替えも可能。ヘッダーと下部の追加導線はいずれも同じステータスで作成画面を開く |
| カラムヘッダー | ヘッダー | ステータス名、タスク件数（WIP 上限設定時は `件数/上限`）、追加アイコン、上端アクセント色帯 | ステータス名クリックで名前編集。追加アイコンで新規タスク作成（全画面 2 ペイン作成ビュー `create` へ遷移）。上端 2px の色帯は `columns[].color`（`#rrggbb`、大文字は小文字化）を反映し、未設定・不正時は `order` index ベースのフォールバックパレット（CSS テーマトークン）で表示してライト/ダーク両テーマに追従する。`columns[].wipLimit` 設定時は件数バッジを `表示件数/上限` 形式にし、**フィルタ非適用の総件数**が上限を超えるとバッジを警告色 + tooltip（`WIP上限超過（全N件 / 上限M件）`）にする。超過してもタスク作成・DnD は拒否しない |
| カラム追加ボタン | ボタン | ボード右端に表示される「+ カラムを追加」ボタン | クリックでカラム名入力フィールドを表示 |
| タスクカード | カード | [task-card-spec.md](./task-card-spec.md) を参照 | ドラッグ可能。クリック（または Enter / Space）で詳細（全画面 2 ペイン）へ遷移する。サブIssue進捗バーは**バーのみ表示**し、`X/Y` 数値はカードフッターへ集約する（進捗値は progressbar の `aria-label`/`aria-valuenow` で提供）。集計対象は**全子孫タスク**（完了数 `X` は「完了カラム」と一致する件数、総数 `Y` は全子孫件数）。サイクル参照（A→B→A、A→A）下でも有限ステップで停止し、同一子孫は 1 回しか数えない。子孫 0 件のときは進捗バーを表示しない |

## ユーザー操作

| 操作 | トリガー | 振る舞い | 遷移先 |
|:-----|:--------|:---------|:-------|
| プロジェクトを開く | 「開く」ボタンクリック | OSのディレクトリ選択ダイアログを表示。選択後にmdファイルを読み込んでボードに表示 | ボードビュー |
| タスクの追加 | カラムヘッダーの追加アイコン、またはカラム下部の「タスクを追加」 | 対象カラムを初期ステータスにした全画面 2 ペイン作成ビューを表示する | 作成後はボードビュー |
| タスクのステータス変更 | カードをドラッグして別カラムにドロップ | `move_task` IPC を 1 回呼び出す。BE が frontmatter `status` の更新、移動元カラム `cardOrder` からの除去、移動先カラム `cardOrder` の設定を単一コマンド内でまとめて行う | - |
| カラム内のカード並び替え | カードをドラッグして同一カラム内でドロップ | カラム間移動と同じ `move_task` IPC を 1 回呼び出す（`fromColumn === toColumn` のため status は変更されず `cardOrder` のみ更新される）。カード表示順は `.spec-board/config.json` の `cardOrder` に永続化する（[config-spec.md](./config-spec.md) 参照）。並び順に変化が無い場合は IPC を呼ばない。永続化した並びは reopen 時に `open_project` の payload 順として復元される（rehydration） | - |
| カラムの追加 | 「+ カラムを追加」ボタンクリック | カラム名入力フィールドを表示。入力確定で新カラムを追加する。最新 state で同名または `order` 上限（u32 最大値）を検出した場合は競合として no-op（`update_columns` IPC を呼ばず、追加失敗トースト）にする | - |
| カラム名の編集 | カラムヘッダーのステータス名をクリック | インライン編集モードに切り替わり、ステータス名を変更可能。該当するタスクのmdファイルも一括更新 | - |
| カラムの削除 | カラムヘッダーの右クリックメニュー | 確認ダイアログを表示。カラム内にタスクがある場合は移動先カラムをドロップダウンで選択させ、全タスクの `status` を一括更新してから削除。タスクがない場合はそのまま削除 | - |
| 完了タスクの一括アーカイブ | 完了カラム（doneColumn）ヘッダーの右クリックメニュー「タスクをまとめてアーカイブ」 | カラム内の全タスクを 1 件ずつ直列に `archive_task` へ送る。同一カラム内で完結する親子は子から順に送って 1 パスで成功させ、カラム外に子が残る親などの失敗は該当タスクだけスキップして続行する。結果は成功 / 失敗件数の toast で要約する。メニュー項目は完了カラムにのみ表示する | - |
| カラムの並び替え | カラムヘッダーをドラッグして別カラム上にドロップ | ColumnHeader を `draggable=true` のハンドルとし、HTML5 ネイティブ DnD（独自 MIME `application/x-spec-board-column`、payload は `columnName` 文字列）で並び替える。drop 確定時に表示順（`order` 昇順）上で `fromColumnName` / `toColumnName` を index に再解決し、全カラムの `order` を 0-origin 連番に正規化して `update_columns` IPC を呼ぶ。楽観 dispatch（`columns-replaced`）→ 失敗時 rollback dispatch を行い、`aria-live="polite"` のライブリージョンに楽観適用直後 `「{カラム名}」を {移動先 index+1} 番目に移動しました`、`update_columns` 失敗時 `「{カラム名}」の移動を取り消しました` をアナウンスする。同位置ドロップ / 1 カラムのみ / `fromColumnName` が queue 待ち中に削除された場合は副作用ゼロ（IPC / dispatch / アナウンスを一切行わない）。子 rename / メニュー / +追加 ボタン上での dragstart は `data-column-dnd-disabled` 属性 + 最外殻 dragstart で `event.preventDefault()` により中止し、元の click 動作のみが発火する | - |

## 状態管理

### ページの状態

| 状態名 | 型 | 初期値 | 更新トリガー |
|:-------|:---|:-------|:-----------|
| projectPath | `string \| null` | `null` | ディレクトリ選択時 |
| columns | `Column[]` | `[]` | プロジェクト読み込み時、カラム追加/編集/削除時 |
| tasks | `Task[]` | `[]` | プロジェクト読み込み時、ファイル変更検知時、UI操作時 |
| isLoading | `boolean` | `false` | プロジェクト読み込み開始/完了時 |

### 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> プロジェクト未選択
    プロジェクト未選択 --> 読み込み中: ディレクトリ選択
    読み込み中 --> ボード表示: 読み込み成功
    読み込み中 --> エラー: 読み込み失敗
    エラー --> プロジェクト未選択: 別ディレクトリ選択
    ボード表示 --> ボード表示: タスク操作・ファイル変更検知
    ボード表示 --> 読み込み中: 別プロジェクトを開く
```

## 初期状態

### プロジェクト未選択時

- ボード領域に「プロジェクトを開く」ボタンと簡単な説明テキストを中央表示

### 空プロジェクト（mdファイル0件）

- デフォルトカラム（Todo / In Progress / Done）を表示
- 各カラムは空の状態で、「+ 追加」ボタンのみ表示
- ボード中央に「タスクがありません。「+ 追加」ボタンまたはmdファイルを作成してタスクを追加してください」のガイドメッセージを表示

### config.json なし・タスクあり

- 既存タスクの `status` フィールドから出現順にカラムを自動生成
- 生成したカラム定義を `config.json` に保存

## 画面区分（ボード / 設定 / 全画面詳細 / 作成）

アプリは `board`（既定）/ `settings` / `detail`（全画面詳細）/ `create`（全画面タスク作成）の画面区分を持ち（マイルストーン別ビュー `milestone` を含む）、ヘッダーバー直下の本体（`<main>`）を区分ごとに出し分ける。ルーティングライブラリは導入せず、React 標準の状態のみで管理する。

- **既定は `board`**。起動直後・プロジェクト未選択でも従来どおりボード（または「プロジェクトを開く」案内）を表示する。
- **遷移**: ヘッダーバーの設定ボタンで `board ⇄ settings` をトグルする。設定画面表示中はボタン文言が「ボードへ戻る」になる（`detail` 表示中は `board` と同じく「設定」表記）。
- **全画面詳細（`detail`）への遷移**: タスクカードをクリック（または Enter / Space）すると、選択と同時に `<main>` を占有する全画面 2 ペイン詳細ビュー（DetailScreen）へ即遷移する（左ペイン＝タイトル＋本文、右ペイン＝プロパティサイドバー）。遷移アニメーションは無い。**詳細は全画面 2 ペイン（DetailScreen）の単一形態とする（Issue #267）。board 上に詳細を重ねる形態は持たない。右プロパティサイドバーの集約項目（status / priority / labels / sub-issue / links）構成は維持する。**
- **詳細ビューの狭幅レスポンシブ**: DetailScreen は `md`（768px）未満で本文上・サイドバー下の縦積み（上ボーダー）、`md` 以上で左本文・右 360px サイドバーの横 2 ペイン（左ボーダー）に折り返す。各ペインは個別に縦スクロールする。
- **`detail` からの戻り**: 全画面詳細ビューの「← 戻る」ボタンまたは Esc キーでボードへ戻る。戻ると選択タスクは解除されクリーンなボードになる。削除確認ダイアログ表示中は Esc を無視する。
- **`detail` と `settings` は排他**: 全画面詳細表示中に「設定」を押すと設定画面へ直行し、詳細は閉じる（選択タスクも解除する）。これにより「detail → settings → board」と辿っても詳細は復活しない。
- **選択タスク消失時のフォールバック**: 全画面詳細表示中にプロジェクト切替・外部更新などで選択タスクが消失した場合は、詳細に取り残さずボードへ戻す。
- **ボード状態の保持**: 設定画面・全画面詳細・全画面作成表示中もボードの状態（読み込み済みタスク・カラム・作成ビューの状態など、アプリ最上位で保持する状態）は破棄されず、ボードへ戻ると復帰する。ただしボード内部のスクロール位置は保持対象外。`detail` からの戻りでは選択タスクは（前述のとおり）解除される。
- **全画面タスク作成（`create`）への遷移**: タスク作成は**全画面 2 ペイン作成ビュー（TaskCreateScreen）**で行う（旧 480px モーダルは廃止）。viewport 全体を占有し、上部 chrome（topbar / subbar）・下部固定フッターと、左ペイン＝入力フォーム / 右ペイン＝ライブプレビュー（frontmatter＋本文の最終形を Raw / レンダリングでトグル表示、既定はレンダリング）で構成する。作成ビューでは共通の HeaderBar / AppSidebar は非表示（全画面 standalone レイアウト）。左ペインの入力フォームは次の入力 UI を持つ:
  - **ステータス / 優先度の popover select**: `<select>` ではなく色付き swatch + chevron の trigger と `role="listbox"` の popover（option は `role="option"`）。trigger クリック / ArrowDown / Enter で開き、クリックまたは ArrowUp/Down・Home/End で選択（端は循環）、Esc / 外側クリックで閉じる。popover を開いている間の Esc は capture フェーズで捕捉して画面の破棄確認へ伝播させず、閉じている間は画面の Esc を妨げない。ステータスの swatch 色はボードのカラム色帯と同一の accent 解決、優先度は High=赤 / Medium=黄 / Low=青（カードの優先度バッジと同配色）+「なし」。
  - **ラベルの popover 複数選択（GitHub 風）**: trigger（選択済みを背景色付きバッジで表示 / 未選択は「ラベルを選択…」）をクリックで popover を開き、検索欄で `labels.yml` 由来の既存ラベルを絞り込み（大文字小文字を無視した部分一致）、option のトグルで複数選択する（選択中は ✓）。既存に無い検索語は「作成」候補または検索欄 Enter でその場作成して選択する。IME 変換確定の Enter では作成しない。バッジ色は `labels.yml` の `color`（#RRGGBB）を `color-mix` で淡い背景 + 濃い文字に変換（優先度バッジと同様の塗り）、未設定時は中立グレー。popover を開いている間の Esc は capture フェーズで画面の破棄確認へ伝播させず、外側クリックでも閉じる。`labels.yml` 不在・取得失敗時は既存候補なし（新規作成のみ可）。
  - **Markdown ツールバー**: 説明欄上部に見出し / 太字 / 斜体 ｜ 引用 / コード / リンク ｜ 箇条書きリスト / 番号付きリスト / タスクリストの 9 ボタン（区切りで 3 グループ）。行プレフィックス系とインライン囲み（太字 / 斜体 / コード）は選択範囲に適用し（適用済みならトグルで剥がす）、リンクは `[選択]()` を生成して URL 入力位置へカーソルを移す。適用後も選択範囲を復元する。
  - **保存先パスプレビュー**: ファイル名欄直下に保存先フルパス（衝突回避の連番サフィックス適用後の想定ファイル名）を表示する。無効入力時は警告表示に切り替わる。IPC が失敗した場合や、成功しても戻り値の形が不正な場合は `pending` に戻し、直前の有効なパス表示を残さない。
  - **ライブプレビュー操作**: 右ペインはレンダリング / Raw 切替に加え、最終 Markdown の UTF-8 バイト長表示、折りたたみ（topbar トグル / プレビュー内の閉じるボタン）、ドラッグハンドルによる幅変更（下限 340px / 上限 viewport 幅の 62%）、保存先ファイル名のフッター表示を持つ。
  - **下部固定フッター**: 左に validation ヒント（タイトル未入力時「タイトルを入力してください」/ 入力済み「保存先: {相対パス}」）、右にキャンセルと「タスクを作成」。作成ボタンはタイトル未入力時 disabled で、フォーム外配置のため `formRef` 経由の `requestSubmit`（⌘Enter と同一経路）で送信する。
  - **同期ステータスバッジ**: topbar に「監視 N files」を表示する（N は読み込み済みタスク総数の流用。watcher の実監視ファイル数を BE→FE 配線することはしない）。
  起動導線は 2 つ:
  - **board の「+ 追加」**: カラムヘッダーの「+ 追加」から起動。親フィールドは全タスクから選択可能。戻り先は board。
  - **detail の「+ サブIssue追加」**: 詳細ビューのサイドバーから起動。親は起動元タスクに self-set され read-only。戻り先は**起動元の detail（親タスク）**。利用可能なステータスが無い場合はトーストして遷移しない。
- **`create` の保存・閉じ操作と戻り先**: ⌘（macOS）/ Ctrl（Windows/Linux）+Enter で保存する（フォームのバリデーションを通過した場合のみ送信）。「キャンセル」/ Esc は入力がある場合は破棄確認ダイアログ（「入力内容を破棄しますか？」/「破棄する」）を表示し、確定で閉じる（未入力なら即閉じる）。破棄確認ダイアログ表示中は画面側の Esc / ⌘+Enter を抑止する（ダイアログ側が Esc を処理し、1 回の Esc で画面まで閉じない）。IME 変換中（isComposing）のキー操作は無視する。戻り先は起動導線で退避した値（board 起点→board、detail サブIssue 起点→元の detail）に従う。送信中（`isSubmitting`）は Esc・閉じ操作・入力を抑止する。送信失敗（重複等）時は画面に留まりトーストを出す。全画面ビューのため detail は unmount され、旧モーダル時代の上位モーダル調停は持たない。
- **重ね合わせ／全画面 UI の整理**: 全画面詳細ビュー（DetailScreen）は `detail` 区分の本体、全画面作成ビュー（TaskCreateScreen）は `create` 区分の本体として、それぞれ `<main>` に表示する（`settings` / `milestone` 表示中は作成導線非表示）。トースト通知とアクセシビリティ用ライブリージョンは画面区分に依らず常時表示する。
- **「開く」操作**: 設定画面表示中に「開く」を押した場合は、押下時点でボードへ戻したうえでプロジェクトを開く。

### 設定画面（サブナビ + タブ）

設定画面はサブナビ（タブ）と、アクティブタブのパネルで構成する。
- サブナビの設計上の表示項目は「ラベル / マイルストーン / ステータス / 設定ファイル」。各タブはアイコンと live 件数（設定ファイルは件数なし）を持ち、左端に「戻る」と `.spec-board / プロジェクト設定` を表示する。タスク数・ファイル数の compact 表示は置かない。
- 「マイルストーン」を選択すると canonical な専用ビュー（`MilestoneViewScreen`）へ遷移し、同じ設定サブナビを維持する。ラベル / ステータス / 設定ファイルは設定パネル内で切り替える。

- **サブナビ**: タブが 1 枠でもタブ UI を表示する。WAI-ARIA Tabs のロール属性（`tablist` / `tab` / `tabpanel`、`aria-selected`、`aria-controls` / `aria-labelledby`）を付与する。タブ複数化時のキーボード操作（矢印 / Home / End・roving tabindex）は将来対応。
- **ラベルタブ（CRUD）**: ラベルマスタの作成・編集・削除を行えるフル機能の管理タブ。各ラベルは色プレビューとともに一覧表示する（色解決規則は [label-registry-spec.md](./label-registry-spec.md) を参照）。取得失敗時はトーストを出さずタブ内のインライン文言で告知する。`labels.yml` 不在・0 件は「ラベルなし」相当の空表示とする（エラーではない）。validation 挙動の詳細は [config-spec.md](./config-spec.md) のラベル設定画面節を参照。
- **外観設定**: テーマ（ライト / ダーク / システム）・表示密度（標準 / コンパクト）・アクセントカラー（5 色）の内部設定 API は保持する。設計chromeの設定サブナビでは外観タブを通常表示しないが、`SettingsScreen.initialTabId="appearance"` で直接到達した場合は選択中タブとして表示し、`aria-labelledby` の参照先を維持する。設定値は従来どおりクライアントローカル（`localStorage`）に永続化する。
- **ステータスタブ**: App が読み込み済み project のカラム順・色・名称、task 使用数、完了カラムを渡す。空カラムの追加 / 削除、並び替え、rename、完了カラム変更を `update_columns` で保存する。タスクが 1 件以上残るカラムと最後の 1 カラムは削除不可。保存失敗時は dirty state を維持して再試行できる。「ボードで確認」は board、「設定ファイルを見る」は設定ファイルタブへ遷移する。
- **設定ファイルタブ**: `config.json` / 自動生成 `GUIDE.md` を切り替える読み取り専用 viewer（行番号、copy / GUIDE 再生成 / 外部エディタ / folder 表示 action）を提供する。現段階の `SettingsScreen` 内部到達は canonical example の表示であり、実ファイル読込と各 OS / IPC action は `ConfigFileTab` callback の App 接続後に有効になる（未接続時は presentational no-op）。
- **直接到達 API**: `SettingsScreen.initialTabId` で初期タブを指定できる。未知 ID は先頭のラベルタブへフォールバックする。`onBack` が指定された場合は設定 subbar の「戻る」から呼び出す。

## IDEシェル（サイドバー / ビュー切替 / 検索フィルタ / 外観）

ヘッダーバー直下を「左サイドバー｜メイン」の横 2 分割で構成し、IDE ライクなシェルを提供する。サイドバー・ビュー切替・外観の各設定はクライアントローカル（`localStorage`）に保存し、プロジェクトの `.spec-board/config.json` には含めない。

### サイドバー（プロジェクトスイッチャー + ファイルツリー）

- 左端に折りたたみ可能な `<aside>` を常時表示する。折りたたみ状態は `localStorage`（`spec-board:sidebarCollapsed`）に永続化する。
- **プロジェクトスイッチャー**: 現在開いているプロジェクト名と「開く」ボタン、最近開いたプロジェクト一覧を表示する。一覧の項目をクリックするとディレクトリ選択ダイアログを経由せず、そのパスのプロジェクトを直接開く。
- **最近開いたプロジェクト**: 読み込み成功時に `localStorage`（`spec-board:recentProjects`）へ記録する。先頭が最新で最大 8 件、同一パスは先頭へ繰り上げて重複させない。
- **ファイルツリー**: 読み込み済みタスクの `filePath`（プロジェクト相対）からディレクトリ階層を構築して表示する（実ディレクトリ全体の走査ではなく、タスクファイル由来のツリー）。各階層はディレクトリを先に、ファイルを後に名前昇順で並べる。ファイル（タスク）クリックで対象タスクを選択する。サイドバーは画面区分（board / settings / detail / milestone）に依らず常時表示する。
- **Explorer行の表示**: サイドバー幅は 248px、project group 見出しは 24px、ツリー行は 22px とする。各行は深さ 12px のインデント、開閉用のSVG chevron、ディレクトリのfolder icon、Markdownタスクのfile iconを持ち、タスクの状態が `In Progress` / `Done` の場合は右端に `●` / `✓` を表示する。選択中の行は accent の薄い背景で強調する。
- **project groupの開閉**: project名を大文字で表示するgroup見出しをクリックすると、そのgroupだけを折りたためる。ワークスペース全体の折りたたみ（`spec-board:sidebarCollapsed`）とは独立した状態とする。

### サブバー（ビュー切替: ボード / 一覧 / ツリー / カレンダー / ロードマップ / GUIDE.md）

メイン上部に WAI-ARIA Tabs のサブバーを置き、ビューアイコン付きのタブでボード領域の表示形態を切り替える。選択は `localStorage`（`spec-board:viewMode`）に永続化する。右側にはキーワード検索、フィルタ開閉、表示密度の操作群を置き、GUIDE.mdタブは設定画面のGUIDE表示へ遷移する。後述の横断フィルタは全ビュー共通で適用される。

- **ボード**: 既存のカンバン（カラム + DnD）。
- **一覧**: status section ごとに、status / priority / title・ID / labels / due / 直下子進捗 / file を table row で表示する。status / priority / title / file の header は昇順・降順を切り替えられ、行クリックで詳細を開く。App の `columns` / `doneColumn` を使ってカラム順と完了表示を決め、空 section も「タスクなし」として残す。「+ 追加」は該当statusを初期値に作成画面へ遷移する。
- **ツリー**: status section + table-like columns（task / status / priority / labels / 全子孫進捗 / file）で parent/children 階層をインデント表示する。子を持つノードは個別に展開 / 折りたたみでき、toolbar の「すべて展開 / すべて折畳」でも一括変更できる。初期状態は全展開。App の project 名、`columns` / `doneColumn` を使い、section 順・色・完了進捗を決める。「+ 追加」は該当statusを初期値に作成画面へ遷移する。
  - 階層構造はバックエンドが確定する（`open_project` / `get_tasks` の `taskTree`）。ノードは `{ filePath, children }` のネスト表現で、深さは構造から導出する。
  - 並び順は他ビューと同じボード表示順（カラム表示順 → カラム内 `cardOrder` → `id` 昇順）で、ルート列・兄弟列の双方に適用する。
  - 親が存在しないタスク（孤立を含む）はルート扱い。親が絞り込みで除外された場合も、その子はルートへ昇格する。
  - 親子関係が循環している場合でも、全タスクがちょうど 1 回だけ表示される。循環しているタスク自身はルート扱いになり（ルート列の中でボード表示順の位置に並ぶ）、それにぶら下がる子タスクは親の下に残る。
  - 絞り込みはツリーにも適用され、表示されるノード集合は絞り込み後の集合と一致する。
- **カレンダー**: `due` 日付を月 42 cell grid または週 7 cell grid に配置し、前後の月 / 週への移動、今日への復帰、月 / 週切替を提供する。status filter は App の `columns[].order` 順、完了・期限超過判定は `doneColumn` を使う。右 sidebar に今日、今後 21 日（期限超過の未完了を含む）、status filter、期限なし / 不正期限を表示する。日 cell は最大 3 件を表示し、超過分は「ほか N 件」に集約する。task click は共通 `onTaskClick` を呼び全画面詳細へ遷移する。
- **ロードマップ（Epic Roadmap）**: マイルストーン専用ビューの roadmap とは別のボード表示形態。parent が無い、または可視 task 集合内に parent が存在しない task を Epic とし、直下 child とともに横 timeline へ表示する。期間は `extras.start` → `due` → 今日の順で開始日を、`extras.end` → `due` → 開始日の順で終了日を解決し、終了日が開始日より前なら入れ替える。Epic の期間は自身と直下 child の最小開始日〜最大終了日へ拡張する。日 / 週表示単位、Epic 展開 / 折りたたみ、今日線、週末、status 色 legend、task click、先頭カラムを既定 status とする Epic 追加 actionを提供する。

### 検索 / フィルタ（MVP 採用）

サブバー右側の操作群（キーワード検索、フィルタ開閉、表示密度）は Board / List / Tree で表示し、詳細な条件（ラベル / 優先度 / ステータス / マイルストーン）は「フィルタ」操作でサブバー直下のパネルを開いて指定する。検索・条件は全ビュー共通で絞り込み、各条件は AND で結合する。パネルは初期状態では閉じ、Calendar / Roadmap では右側操作群（キーワード検索を含む）とフィルタパネルを表示しない。これらのビューへ遷移した時点でフィルタの開閉状態も閉じ、Board 等へ戻っても意図せず再表示しない。

- **キーワード**: タイトル / 本文への部分一致（大文字小文字を無視）。
- **ラベル / 優先度 / ステータス**: それぞれ選択集合のいずれかに一致（OR）。空集合は無条件一致。
- **マイルストーン**: 全件 / 未割当 / 指定マイルストーン。
- 絞り込み後 / 全件の件数を表示し、いずれかの条件が有効なときはクリア操作を提供する。

### Global Search / Command Palette

- ヘッダーの検索ボタンまたは `⌘/Ctrl+K` で開き、`Escape` で閉じる。
- タスクの title / id / filePath / labels / **body（本文）** を大文字小文字を無視して検索する。正規化済み検索索引は task 集合が変わったときだけ再構築し、palette が閉じている間は結果計算を行わない。
- クエリは空白（半角・全角）区切りのトークンを **AND** で解釈する。トークンごとに一致フィールドは異なってよい（例: `login bug` はタイトルに login・ラベルに bug で一致する）。
- タスク結果は「最優先一致フィールドの重み降順（title > id > label > filePath > body）→ board 表示順」の安定ソートで並べる。空クエリは全タスクを board 表示順のまま表示する。
- 各結果には一致フィールドのバッジ（ID / ラベル / パス / 本文。タイトル一致は自明のため非表示）を出し、本文一致には一致箇所の前後 30 文字の抜粋（切れている側に「…」）を併記する。
- New Task / Settings / Milestone / Guide の action とタスク結果を合わせた総件数を表示する。DOM に描画する結果は先頭 50 件までとし、超過時は「N 件中 50 件を表示」と検索語による絞込案内を表示する。
- `ArrowUp` / `ArrowDown` の選択範囲は表示中の結果内に制限し、検索結果が減った場合も `Enter` は表示中の有効な選択だけを開く。

### 外観（テーマ / 密度 / アクセント）

- **テーマ**: ライト / ダーク / システム。`system` は OS の配色設定（`prefers-color-scheme`）に追従し、OS 設定の変化にもリアルタイムで追従する。
- **表示密度**: 標準 / コンパクト（ルート `font-size` を切り替えて余白・文字サイズを一括スケール）。標準は `17px`、コンパクトは `16px` を基準とし、本文の既定文字サイズは `14px` とする。
- **アクセント**: 5 色（ブルー / バイオレット / グリーン / アンバー / ローズ）。
- 実装はセマンティックな CSS 変数トークン（surface / foreground / muted / border / accent ほか）を `documentElement` の `data-theme` / `data-density` / `data-accent` 属性で実行時に切り替える方式。設定は外観設定タブで行うほか、ヘッダーにライト ⇔ ダークのクイックトグルを置く。
- 設定はクライアントローカル（`localStorage`: `spec-board:appearance`）に保存する。

## エラー表示

| エラーケース | 発生条件 | 表示方法 | ユーザーアクション |
|:------------|:---------|:---------|:----------------|
| ディレクトリ読み込み失敗 | 指定ディレクトリが存在しない、またはアクセス権限がない | トースト通知 | 別のディレクトリを選択 |
| mdファイルパースエラー | フロントマターに invalid 系の値が含まれる（対象 warning code: `invalidTitleUsedFileName` / `invalidStatusUsedDefault` / `invalidParentIgnored` / `nonStringExtraKeyIgnored` / `extraValueNotJsonCompatible`。`parentCycle` は循環バナーで別扱い、`parentNotFound` / `missing*` 系はリンク切れ・別カテゴリで対象外） | プロジェクトロード時 (state.kind が `"loaded"` に遷移したとき) に warning Toast「パースエラーが N 件あります」を 1 回表示（同一 `loadedPath` 内では再発火しない / 別 project 切替後 N >= 1 なら再発火）。加えて該当カードのタイトル行右端に赤いパースエラーアイコンを表示（リンク切れの黄アイコンと併存可） | mdファイルを手動修正 |
| ファイル書き込み失敗 | ディスク容量不足、権限エラー | トースト通知（書き込み系コマンドは下記の一元化対象） | ファイルシステムの状態を確認 |
| リンク切れ (プロジェクトロード時) | 開いたプロジェクトに `parent` / `links` / `children` / `reverseLinks` のいずれかが解決できないタスクが N >= 1 件含まれる | プロジェクトロード時 (state.kind が `"loaded"` に遷移したとき) に warning Toast「リンク切れが N 件あります」を 1 回表示。同一 `loadedPath` 内では再発火しない（別 project に切替後、N >= 1 なら再度 1 回発火する） | 詳細（全画面 2 ペイン）で該当 path を確認し、リンクを削除するか参照先ファイルを作成。詳細は [task-card-spec.md](./task-card-spec.md) の「エラー表示」セクション参照 |
| watcher listener 登録失敗 | project open 前の 5 event registration のいずれかが失敗 | `open_project` を開始せず、旧 loaded 表示（未読込なら idle）を維持して「ファイル監視の準備に失敗しました。プロジェクトをもう一度開いてください」を 1 回通知 | 同じ「開く」操作を再試行。成功済み partial listener は解除済みで、次回は 5 本を再登録する |

### プロジェクト読み込み時の注意

`open_project` / `get_tasks` が返す `loadWarnings` は、読み込みを継続できた部分失敗を表す。loaded board のメイン領域上部に `ProjectLoadWarnings` の compact persistent panel を表示し、警告が 0 件なら panel 自体を描画しない。panel は初期状態では件数だけを示し、「原因を確認する」を展開すると code の表示名、stage、project root 相対 path（path が `null` の場合は「プロジェクト全体」）、message を確認できる。unknown code / stage や空 message でも汎用ラベルへ安全にフォールバックし、長い path / message はレイアウトを壊さず折り返す。

初回 open と full rescan 後の warnings 更新では、同じ project path・同じ warnings fingerprint を重ねて通知せず、内容が変わった場合だけ `読み込み時の注意が N 件あります` の warning toast を表示する。空配列への遷移では toast を出さず panel を消す。project を切り替えた場合は path ごとに state と通知を分離し、旧 project の warnings を新 project に表示しない。panel は `settings` / `create` / no-project の画面には表示しない。

### 書き込み失敗トーストの一元化

書き込み（ミューテーション）系コマンドの失敗トーストは、各ハンドラではなく IPC ラッパ層（`invokeWrapped`）に集約して発火する。これにより失敗通知の source of truth を一本化し、握り潰し・通知の不統一・二重通知を防ぐ。

- **共通トースト対象（allowlist）**: `create_task` / `update_task` / `delete_task` / `move_task` / `add_link` / `remove_link` / `update_columns` の失敗。`invokeWrapped` が「&lt;操作&gt;に失敗しました: &lt;詳細&gt;」を 1 件発火する。操作ラベルはコマンド単位で決まる（例: `update_columns` 由来はカラムの追加 / 改名 / 削除 / 並び替えのいずれでも「カラムの更新に失敗しました」に統一される）。`HAS_CHILDREN` 詳細は「子タスクが存在するため削除できません」に翻訳する。
- **操作フックへのエラー通知注入**: App は `onMutationError` を各操作単位フックへ注入する。callback は失敗が allowlist 由来（= `invokeWrapped` が通知済み）のときだけ上位の失敗トーストを抑止し、判定は起点コマンド名を保持する `TauriError.command` に基づく。操作固有の成功通知・rollback・retry 用の rejection は `useTaskDelete` や `useColumnRename` など各操作フックが担当する。
- **サイレント化させないもの（注入callbackが通知）**: allowlist 外の tauri 失敗（`open_project` / `update_columns` 前段の `get_columns` refresh 失敗）と非 tauri 失敗（`invalid-state` / カラム domain validation）。
- **成功トースト・LiveRegion アナウンス**は本一元化の影響を受けず従来どおり表示する。

watcher listener の一部だけで open を続行する degraded mode は禁止する。registration readiness が成立しない限り loading へ遷移せず、`open_project` も呼ばない。

## アクセシビリティ

| 観点 | 対応方針 |
|:-----|:---------|
| キーボード操作 | Tab でカード間移動、Enter / Space で詳細（全画面 2 ペイン）へ遷移、矢印キーでカラム間移動 |
| スクリーンリーダー | カラムに `role="list"`、カードに `role="listitem"` を付与。カラム間移動の楽観 dispatch 直後に `aria-live="polite"` のライブリージョン（視覚非表示 / `role="status"` / `aria-atomic="true"`）で「移動しました」を通知。`move_task` 失敗によるフル rollback 時はさらに「移動を取り消しました」を追加通知する。「楽観 dispatch 後の projectVersion 不一致」では追加の取消アナウンスは流さない（state が新 project に切替済みのため）。同一カラム並び替え、および「楽観 dispatch 前 invalid-state（preflight 失敗）」ではライブリージョンを更新しない（エラー toast のみ） |
| フォーカス管理 | ドラッグ&ドロップ完了後、移動したカードにフォーカスを維持 |
| 全画面詳細ビュー（DetailScreen）のフォーカス | `<section aria-label="タスク詳細" tabIndex="-1">` のランドマークと視覚非表示の `<h1>`（タスクタイトル）を持つ。マウント時に section へフォーカスを移し、ビュー先頭へキーボード/SR フォーカスを移動する。「← 戻る」/ Esc で board へ戻る（削除確認ダイアログ表示中は Esc を抑止して競合させない）。サブIssue 追加は全画面作成ビュー（`create`）へ遷移し detail を unmount するため、旧モーダル時代の上位モーダル調停は不要になった。**focus trap は適用しない**: DetailScreen は modal ではなく、HeaderBar と AppSidebar が `detail` 区分でも常時操作可能なため、Tab フォーカスを DetailScreen 内に閉じ込めるとそれらの操作系へキーボードで到達できなくなる。よって Tab は通常どおり画面全体を巡回させる |
| 全画面作成ビュー（TaskCreateScreen）のフォーカス | `<section aria-label="タスク作成" tabIndex="-1">` のランドマークを持つ。左ペイン＝入力フォーム、右ペイン＝ライブプレビュー。⌘/Ctrl+Enter で保存、Esc / 「キャンセル」は入力ありなら破棄確認ダイアログ（`role="alertdialog"` + `aria-modal`）を経由して閉じ、戻り先（board / 元の detail）へ遷移する。ダイアログ表示中は画面側の Esc / ⌘+Enter リスナーを抑止して二重ハンドリングを防ぐ。送信中（`isSubmitting`）は Esc・閉じ操作・入力を抑止する。ステータス/優先度は popover select（trigger に `aria-haspopup="listbox"` / `aria-expanded`、popover は `role="listbox"`、各 option は `role="option"` / `aria-selected`。ArrowUp/Down・Home/End で highlight 移動、Enter で確定、open 中の Esc は capture フェーズで画面の破棄確認へ伝播させない）、ラベル入力は combobox + listbox、説明欄は `role="toolbar"` の Markdown ツールバー、パスプレビューは `aria-live="polite"` の可視ライブリージョンを持つ。作成ビューでは共通の HeaderBar / AppSidebar を非表示にした全画面 standalone レイアウトを採り、DetailScreen 同様 focus trap は適用しない |
| ヘッダ操作ボタンのフォーカス可視化 | 詳細ビューの「← 戻る」ボタンに `focus-visible:ring-2 focus-visible:ring-accent`、削除ボタンに `focus-visible:ring-2 focus-visible:ring-red-500` を付与し、キーボードフォーカスを可視化する（アクセント色はテーマのセマンティックトークンに追従する） |

## ドラッグ&ドロップ仕様

### 基本方針

- HTML5 ネイティブ Drag and Drop API のみで実装する（外部 DnD ライブラリは導入しない）
- カード要素に `draggable="true"` を付与し、独自 MIME `application/x-spec-board-task` で payload を運ぶ
- 外部からの D&D（テキスト・ファイル等、独自 MIME を持たないもの）は `dragover` で `preventDefault` せず drop を受け付けない

### IPC シーケンス

| 種類 | IPC 呼び出し |
|:-----|:------------|
| カラム間移動 | `move_task({ filePath, fromColumn, toColumn, toColumnFilePaths, expectedToColumnOrder })` を 1 回。status 変更・移動元 cardOrder からの除去・移動先 cardOrder の設定はすべて BE 側の単一コマンド内で完結する |
| 同一カラム内並び替え | `move_task({ filePath, fromColumn, toColumn, toColumnFilePaths, expectedToColumnOrder })` を 1 回（`fromColumn === toColumn`）。並び順に変化が無い場合は IPC を呼ばない |

`expectedToColumnOrder` は「移動先カラムが移動前にこうであったはず」という並びで、FE が drop 直前に見ていた表示順をそのまま送る。BE はこれを resident な board 表示順（カラムの `cardOrder` の並び → 載っていないものは `id` 昇順）と照合し、一致しない場合は**書き込みを一切行わずに**移動を拒否する。拒否時は task md・`config.json` のいずれも変更されず、セッションの revision も消費しない。移動元カラムの並びは照合しない（移動元に対する操作は対象を取り除くだけで、他のカードの並びが変わっていても結果が変わらないため）。

`cardOrder` の永続化は上記 IPC で完了し、reopen 時は `open_project` が payload の `tasks` を「カラムの表示順 → そのカラムの `cardOrder` の並び → `id` 昇順」で返すことで表示順を復元する（rehydration）。`cardOrder` に載っていないタスク（新規追加された md 等）はそのカラムの末尾へ `id` 昇順で並ぶ。

楽観的 UI 更新を採用する。drop 確定と同時に status / cardOrder を仮反映し、IPC 完了後は成功か rollback かの 2 分岐に収束する。IPC が 1 回のため、status だけが永続化されて cardOrder が保存されない中間状態は発生しない。

- **成功時**: カラム間移動では `task-updated` を 1 段だけ確定 dispatch する。cardOrder は楽観反映した並びがそのまま永続化されているため、確定用の `card-order-updated` は流さない（IPC 待機中に入った外部更新を巻き戻さないため）。確定値は、対象 task が**楽観 dispatch した Task のまま（誰も触っていない）**であれば BE 応答の Task をそのまま採用し（書き込み後の md を再解析した warning 等がここで反映される）、IPC 待機中に外部更新が入っていた場合は move が所有する `status` だけを載せ替えて title / body / labels 等の外部更新を保護する。対象が state から消えていた場合は確定 dispatch を行わない。同一カラム並び替えでは追加 dispatch を行わない
- **失敗時**: カラム間移動はスナップショットへフル rollback し、ライブリージョンで「移動を取り消しました」を通知する。同一カラム並び替えは移動先 cardOrder のみ 1 段 rollback する
- **競合による拒否時**: 上記の rollback に加えて、最新状態の取り直しを要求する。取り直しは watcher の再同期経路と同じ手続き（in-flight の書き込みを追い越さない read barrier → `get_tasks` → 反映）を通る。これにより、拒否の原因になった変更がまだ watcher で届いていない場合でも画面が現実に追いつき、同じ操作をもう一度行えば成功する。移動元 status の食い違いによる拒否も同じ扱いとする
- **projectVersion 不一致時**: 新 project state を破壊しないため rollback / 確定 dispatch をスキップし、`invalid-state` を返す

BE 側は task md の書き込み成功後に `config.json` の書き込みが失敗した場合、task md を元の内容へ書き戻す best-effort rollback を行う。task md と config.json は別ファイルのため POSIX 上のトランザクション保証はなく、書き戻し自体が失敗した場合の再収束は watcher / 再スキャンに委ねる。

### UI 表現

| 状態 | 表現 |
|:-----|:----|
| ドラッグ中のカード | `data-dragging="true"` 属性 + opacity 0.4 のクラスを付与 |
| Drop ターゲットの hover 位置 | 対応する位置に `<li data-testid="drop-placeholder" aria-hidden="true">` のセパレータを表示 |
| 中央境界判定 | マウス Y 座標がカード中央より厳密に上 (`clientY < middle`) なら上半分、それ以外（中央ピッタリ含む）は下半分扱い |

### エッジケース

- ESC キー押下: ブラウザが `dragend` を発火し、自動で IDLE 状態へ復帰
- Drag 直後の synthetic click: `dragGuardRef` で次の macrotask まで `onClick` を抑止し、誤って詳細へ遷移しないようにする
- IPC 失敗（generic）: カラム間移動 / 同一カラム並び替えのいずれも `move_task` 失敗として扱い、書き込み失敗通知の一元化により「タスクの移動に失敗しました: &lt;原因&gt;」トーストを 1 件表示する（`move_task` は共通トースト対象コマンドのため `invokeWrapped` 層が発火し、App 側の汎用トーストは二重通知回避のため抑止される）。dragState は finally で必ず null に戻す
- stale state: queue 実行時に対象タスクが見つからない / `fromColumn` と `status` が乖離 / `toColumn` が消滅した場合は `invalid-state` で抜ける

### a11y アナウンス

楽観成功アナウンスは IPC 完了を待たず、楽観 dispatch 直後に `onOptimisticApplied` callback を起点に発火する。`invalid-state` のように IPC 後に判明する分岐では、既に「移動しました」アナウンスが出ている前提で扱う。下表は楽観 dispatch 時点と IPC 完了時点を合算したアナウンス結果である。

| イベント | LiveRegion アナウンス | エラー toast |
|:--|:--|:--|
| カラム間移動成功 | 「『タイトル』を『toColumn』に移動しました」 | なし |
| カラム間移動失敗（`move_task` reject、フル rollback 後） | 「『タイトル』を『toColumn』に移動しました」→「『タイトル』の移動を取り消しました」 | 「タスクの移動に失敗しました: ...」（`move_task` 共通トーストを `invokeWrapped` 層が発火。App 汎用トーストは抑止） |
| 同一カラム並び替え（成功 / 失敗いずれも） | なし（`onOptimisticApplied` はカラム間 status 変更時のみ呼ぶ契約） | 失敗時のみ「タスクの移動に失敗しました: ...」 |
| 楽観 dispatch 前 invalid-state（preflight 失敗: target 消失 / status 乖離 / toColumn 消失 / 開始前 version 切替） | なし（楽観 dispatch も `onOptimisticApplied` も発火しない） | `invalid-state` メッセージ |
| 楽観 dispatch 後 invalid-state（IPC 中の projectVersion 切替） | 「『タイトル』を『toColumn』に移動しました」のみ（state は新 project に切替済みのため取消アナウンスは流さない） | 「プロジェクトが切り替わりました」 |

## DetailScreen の field 編集と楽観更新

DetailScreen 上で `status` / `priority` / `labels` を編集すると、UI は IPC（`update_task`）の応答を待たずに即時反映される（楽観更新）。
IPC が失敗した場合は編集前の値に自動ロールバックし、画面右上にエラートーストを表示する。
成功時も成功トーストを 1 件表示する。
ファイル監視で外部から同じタスクが書き換えられたケースでも、楽観中のキーが既に外部値で上書きされていればロールバックは行わない（外部値を優先する整合性ルール）。

## DetailScreen の削除フロー

DetailScreen の「削除」ボタン押下で確認ダイアログを表示する。対象タスクが子タスクを持つかで分岐する。

- **子なし** (`hierarchy.childFilePaths.length === 0`)
  - メッセージ: 「`「{title}」を削除しますか？この操作は取り消せません。`」
  - 確定すると `delete_task` に `orphanStrategy` 未指定で IPC を送る
- **子あり** (`hierarchy.childFilePaths.length > 0`)
  - メッセージ: 「`「{title}」を削除しますか？子タスクが {N} 件あります。`」（`{N}` は子件数、末尾「取り消せません」は付けない）
  - ダイアログ内に「子タスクの処理」ラジオグループを表示する
    - `clear`（既定）: 子タスクの親リンクを解除して削除
    - `abort`: 削除を中止
  - ラジオの選択値はダイアログを開くたびに `clear` にリセットされる
  - 確定すると `delete_task` に選択値 (`"clear"` / `"abort"`) を `orphanStrategy` として IPC を送る
  - BE が `abort` を受け取って子残存を理由に拒否（`"task has children: ..."` 形式）した場合、`TauriError.code` は `HAS_CHILDREN` に分類され、トーストは「タスクの削除に失敗しました: 子タスクが存在するため削除できません」を表示し、ダイアログは維持される

削除に失敗するケース（任意の reject）では、確認ダイアログは閉じずに `削除` ボタンが押下可能な状態に戻る（ユーザにリトライさせるため）。

## 制限事項

- 同一プロジェクト内のタスク数が1,000件を超える場合のパフォーマンスは保証しない
- カラムの並び順・カード並び順は `.spec-board/config.json` に保存（mdファイルには含まない）
- 検索・フィルタリング（キーワード / ラベル / 優先度 / ステータス / マイルストーン）は MVP で採用済み（「IDEシェル」節を参照）。フィルタの選択状態はセッション内の一時状態で永続化しない
- サイドバー / ビュー切替 / 外観などの UI 設定はクライアントローカル（`localStorage`）に保存し、プロジェクトの `.spec-board/config.json` には含めない
- サイドバーのファイルツリーはタスクファイル（`Task.filePath`）由来であり、プロジェクトディレクトリ全体の走査ではない

## 関連仕様

- [config-spec.md](./config-spec.md) - カラム設定・カード並び順の永続化仕様
- [task-card-spec.md](./task-card-spec.md) - タスクカードの表示内容・詳細（全画面 2 ペイン）・フォーム仕様
- [file-system-spec.md](./file-system-spec.md) - ファイル監視・変更検知の仕組み
- [task-format-spec.md](./task-format-spec.md) - mdファイルのフォーマットとフロントマターの定義

## 変更履歴

| バージョン | 日付 | 変更内容 | 変更者 |
|:-----------|:-----|:---------|:-------|
| 1.8 | 2026-08-12 | Global Search / Command Palette（⌘/Ctrl+K、title/id/path/labels検索、主要画面action、キーボード選択）を追加 | - |
| 1.7 | 2026-08-12 | HeaderBar の GUIDE.md、Calendar の日付指定タスク追加を optional callback 境界として追加（App 統合は呼び出し側の責務） | - |
| 1.6 | 2026-08-11 | Epic Roadmap view mode、List / Tree / Calendar の実装済み操作、Settings Status / Config 内部タブと presentational integration boundary、共通 HeaderBar 契約を追記 | - |
| 1.5 | 2026-08-11 | Issue #508: watcher listener 登録失敗時の fail-closed、旧表示維持、1 回通知、再試行時の全 listener 再登録、degraded mode 禁止を追加 | - |
| 1.4 | 2026-08-02 | Issue #401: タスク階層ツリーの組み立てを BE へ移管（`taskTree` payload 追加）、FE は可視集合の枝刈りのみに縮小 | - |
| 1.3 | 2026-08-01 | Issue #458: loaded board の `ProjectLoadWarnings` persistent panel、`loadWarnings` summary toast、fingerprint抑制とproject切替 isolationを追加 | - |
