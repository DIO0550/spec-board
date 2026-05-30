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
| ヘッダーバー | ナビゲーション | プロジェクト名、設定ボタン、ディレクトリ選択ボタンを表示 | 設定ボタンでカラム管理パネルを開く。「開く」でプロジェクトディレクトリを選択 |
| カラム | コンテナ | ステータスに対応する縦列。ヘッダーにステータス名とタスク数を表示 | ドロップ先として機能。カラム内でのカード並び替えも可能 |
| カラムヘッダー | ヘッダー | ステータス名、タスク件数、追加ボタン | ステータス名クリックで名前編集。「+ 追加」で新規タスク作成 |
| カラム追加ボタン | ボタン | ボード右端に表示される「+ カラムを追加」ボタン | クリックでカラム名入力フィールドを表示 |
| タスクカード | カード | [task-card-spec.md](./task-card-spec.md) を参照 | ドラッグ可能。クリックで詳細パネルを開く。サブIssue進捗バー（カード下部の `X/Y` サマリ + バー）の `Y` は**全子孫タスク**の件数、`X` はその中で「完了カラム」と一致する件数。サイクル参照（A→B→A、A→A）下でも有限ステップで停止し、同一子孫は 1 回しか数えない。子孫 0 件のときは進捗バーを表示しない |

## ユーザー操作

| 操作 | トリガー | 振る舞い | 遷移先 |
|:-----|:--------|:---------|:-------|
| プロジェクトを開く | 「開く」ボタンクリック | OSのディレクトリ選択ダイアログを表示。選択後にmdファイルを読み込んでボードに表示 | ボードビュー |
| タスクのステータス変更 | カードをドラッグして別カラムにドロップ | `update_task` IPC で対象タスクの frontmatter `status` を更新したのち、移動先カラムに対して `update_card_order` を 1 回呼び出す。旧カラムの `cardOrder` は BE 側 watcher が `status` 変更を検知して自動除去する契約 | - |
| カラム内のカード並び替え | カードをドラッグして同一カラム内でドロップ | `update_card_order` IPC を 1 回呼び出してカード表示順を `.spec-board/config.json` の `cardOrder` に永続化（[config-spec.md](./config-spec.md) 参照）。並び順に変化が無い場合は IPC を呼ばない。**reopen 時の rehydration（`open_project` が `config.card_order` を読み込みカラム内の tasks を並び替える）は BE 側の対応が必要（別 issue 依存）** | - |
| カラムの追加 | 「+ カラムを追加」ボタンクリック | カラム名入力フィールドを表示。入力確定で新カラムを追加 | - |
| カラム名の編集 | カラムヘッダーのステータス名をクリック | インライン編集モードに切り替わり、ステータス名を変更可能。該当するタスクのmdファイルも一括更新 | - |
| カラムの削除 | カラムヘッダーの右クリックメニュー | 確認ダイアログを表示。カラム内にタスクがある場合は移動先カラムをドロップダウンで選択させ、全タスクの `status` を一括更新してから削除。タスクがない場合はそのまま削除 | - |
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

## エラー表示

| エラーケース | 発生条件 | 表示方法 | ユーザーアクション |
|:------------|:---------|:---------|:----------------|
| ディレクトリ読み込み失敗 | 指定ディレクトリが存在しない、またはアクセス権限がない | トースト通知 | 別のディレクトリを選択 |
| mdファイルパースエラー | フロントマターに invalid 系の値が含まれる（対象 warning code: `invalidTitleUsedFileName` / `invalidStatusUsedDefault` / `invalidParentIgnored` / `nonStringExtraKeyIgnored` / `extraValueNotJsonCompatible`。`parentCycle` は循環バナーで別扱い、`parentNotFound` / `missing*` 系はリンク切れ・別カテゴリで対象外） | プロジェクトロード時 (state.kind が `"loaded"` に遷移したとき) に warning Toast「パースエラーが N 件あります」を 1 回表示（同一 `loadedPath` 内では再発火しない / 別 project 切替後 N >= 1 なら再発火）。加えて該当カードのタイトル行右端に赤いパースエラーアイコンを表示（リンク切れの黄アイコンと併存可） | mdファイルを手動修正 |
| ファイル書き込み失敗 | ディスク容量不足、権限エラー | トースト通知（書き込み系コマンドは下記の一元化対象） | ファイルシステムの状態を確認 |
| リンク切れ (プロジェクトロード時) | 開いたプロジェクトに `parent` / `links` / `children` / `reverseLinks` のいずれかが解決できないタスクが N >= 1 件含まれる | プロジェクトロード時 (state.kind が `"loaded"` に遷移したとき) に warning Toast「リンク切れが N 件あります」を 1 回表示。同一 `loadedPath` 内では再発火しない（別 project に切替後、N >= 1 なら再度 1 回発火する） | 詳細パネルで該当 path を確認し、リンクを削除するか参照先ファイルを作成。詳細は [task-card-spec.md](./task-card-spec.md) の「エラー表示」セクション参照 |

### 書き込み失敗トーストの一元化

書き込み（ミューテーション）系コマンドの失敗トーストは、各ハンドラではなく IPC ラッパ層（`invokeWrapped`）に集約して発火する。これにより失敗通知の source of truth を一本化し、握り潰し・通知の不統一・二重通知を防ぐ。

- **共通トースト対象（allowlist）**: `create_task` / `update_task` / `delete_task` / `add_link` / `remove_link` / `update_columns` の失敗。`invokeWrapped` が「&lt;操作&gt;に失敗しました: &lt;詳細&gt;」を 1 件発火する。操作ラベルはコマンド単位で決まる（例: `update_columns` 由来はカラムの追加 / 改名 / 削除 / 並び替えのいずれでも「カラムの更新に失敗しました」に統一される）。`HAS_CHILDREN` 詳細は「子タスクが存在するため削除できません」に翻訳する。
- **App 側の重複抑止**: App 各ハンドラは、失敗が allowlist 由来（= `invokeWrapped` が通知済み）のときだけ自前の失敗トーストを抑止する。判定は起点コマンド名を保持する `TauriError.command` に基づく。
- **サイレント化させないもの（App 側が従来どおり通知）**: allowlist 外の tauri 失敗（`open_project` / 同一カラム `update_card_order` / `update_columns` 前段の `get_columns` refresh 失敗）と非 tauri 失敗（`invalid-state` / カラム domain validation）。
- **成功トースト・partial-move 専用文・LiveRegion アナウンス**は本一元化の影響を受けず従来どおり表示する。`update_card_order` は意図的に allowlist 外とし、partial-move 区別を保つ。

## アクセシビリティ

| 観点 | 対応方針 |
|:-----|:---------|
| キーボード操作 | Tab でカード間移動、Enter で詳細パネル展開、矢印キーでカラム間移動 |
| スクリーンリーダー | カラムに `role="list"`、カードに `role="listitem"` を付与。カラム間移動の楽観 dispatch 直後に `aria-live="polite"` のライブリージョン（視覚非表示 / `role="status"` / `aria-atomic="true"`）で「移動しました」を通知。`updateTask` 失敗によるフル rollback 時はさらに「移動を取り消しました」を追加通知する。partial-move（status 確定 + cardOrder のみ rollback）および「楽観 dispatch 後の projectVersion 不一致」では追加の取消アナウンスは流さない（既に「移動しました」が発火済みで status は永続化済み、または state が新 project に切替済みのため）。同一カラム並び替え、および「楽観 dispatch 前 invalid-state（preflight 失敗）」ではライブリージョンを更新しない（エラー toast のみ） |
| フォーカス管理 | ドラッグ&ドロップ完了後、移動したカードにフォーカスを維持 |

## ドラッグ&ドロップ仕様

### 基本方針

- HTML5 ネイティブ Drag and Drop API のみで実装する（外部 DnD ライブラリは導入しない）
- カード要素に `draggable="true"` を付与し、独自 MIME `application/x-spec-board-task` で payload を運ぶ
- 外部からの D&D（テキスト・ファイル等、独自 MIME を持たないもの）は `dragover` で `preventDefault` せず drop を受け付けない
- BE 側コマンド `update_task` / `update_card_order` の実装、および `open_project` が `config.card_order` を読み込んでカラム内 tasks を rehydrate する処理は本仕様の依存先とする（別 issue で起票）。現状の `open_project` は tasks を id 順で返すため、保存した cardOrder が reopen 後に反映されないことを許容する

### IPC シーケンス

| 種類 | IPC 呼び出し |
|:-----|:------------|
| カラム間移動 | (1) `update_task({ filePath, status: toColumn })`、(2) 成功後 `update_card_order({ columnName: toColumn, filePaths })`。旧カラムの cardOrder は BE 側 watcher が status 変更を検知して自動除去する契約 |
| 同一カラム内並び替え | `update_card_order({ columnName, filePaths })` を 1 回。並び順に変化が無い場合は IPC を呼ばない |

楽観的 UI 更新を採用する。drop 確定と同時に status / cardOrder を仮反映し、IPC 完了後に server 値で確定上書きする。`updateTask` 失敗時はスナップショットへフル rollback し、ライブリージョンで「移動を取り消しました」を通知する。partial-move（`updateTask` 成功 / `updateCardOrder` 失敗）の場合は status を `toColumn` に確定保持し、cardOrder のみ永続化済みの実態（`toColumn` は旧 order + 移動タスク末尾補完、`fromColumn` は移動タスク除外済み）に再収束させる。partial-move ではライブリージョンを更新せず、partial-move 専用エラー toast のみで通知する。projectVersion 不一致時は新 project state を破壊しないため rollback / 確定 dispatch をスキップし、`invalid-state` を返す。

### UI 表現

| 状態 | 表現 |
|:-----|:----|
| ドラッグ中のカード | `data-dragging="true"` 属性 + opacity 0.4 のクラスを付与 |
| Drop ターゲットの hover 位置 | 対応する位置に `<li data-testid="drop-placeholder" aria-hidden="true">` のセパレータを表示 |
| 中央境界判定 | マウス Y 座標がカード中央より厳密に上 (`clientY < middle`) なら上半分、それ以外（中央ピッタリ含む）は下半分扱い |

### エッジケース

- ESC キー押下: ブラウザが `dragend` を発火し、自動で IDLE 状態へ復帰
- Drag 直後の synthetic click: `dragGuardRef` で次の macrotask まで `onClick` を抑止し、誤って詳細パネルが開かないようにする
- IPC 失敗（generic）: カラム間移動の `update_task` 失敗時は書き込み失敗通知の一元化により「タスクの更新に失敗しました: &lt;原因&gt;」トーストを表示する（`update_task` は共通トースト対象コマンドのため `invokeWrapped` 層が発火し、App 側の汎用「タスクの移動に失敗しました」は二重通知回避のため抑止される）。同一カラム内の `update_card_order` 失敗は共通トースト対象外のため、従来どおり App 側が「タスクの移動に失敗しました: &lt;原因&gt;」を表示する。dragState は finally で必ず null に戻す
- IPC 部分失敗（partial-move）: カラム間移動で `update_task` 成功 + `update_card_order` 失敗のときは、カラム移動だけは完了しているため「カラムの移動は完了しましたが、並び順の保存に失敗しました。手動で並び替えてください。」と区別して表示する
- stale state: queue 実行時に対象タスクが見つからない / `fromColumn` と `status` が乖離 / `toColumn` が消滅した場合は `invalid-state` で抜ける

### a11y アナウンス

楽観成功アナウンスは IPC 完了を待たず、楽観 dispatch 直後に `onOptimisticApplied` callback を起点に発火する。partial-move / invalid-state のように IPC 後に判明する分岐では、既に「移動しました」アナウンスが出ている前提で扱う。下表は楽観 dispatch 時点と IPC 完了時点を合算したアナウンス結果である。

| イベント | LiveRegion アナウンス | エラー toast |
|:--|:--|:--|
| カラム間移動成功 | 「『タイトル』を『toColumn』に移動しました」 | なし |
| カラム間移動失敗（`updateTask` reject、フル rollback 後） | 「『タイトル』を『toColumn』に移動しました」→「『タイトル』の移動を取り消しました」 | 「タスクの更新に失敗しました: ...」（`update_task` 共通トーストを `invokeWrapped` 層が発火。App 汎用「移動に失敗」は抑止） |
| partial-move（status 確定 + cardOrder のみ補正） | 「『タイトル』を『toColumn』に移動しました」のみ（status は永続化済みのため取消アナウンスは流さない） | partial-move 用エラー toast |
| 同一カラム並び替え（成功 / 失敗いずれも） | なし（`onOptimisticApplied` はカラム間 status 変更時のみ呼ぶ契約） | 失敗時のみ「タスクの移動に失敗しました: ...」 |
| 楽観 dispatch 前 invalid-state（preflight 失敗: target 消失 / status 乖離 / toColumn 消失 / 開始前 version 切替） | なし（楽観 dispatch も `onOptimisticApplied` も発火しない） | `invalid-state` メッセージ |
| 楽観 dispatch 後 invalid-state（IPC 中の projectVersion 切替） | 「『タイトル』を『toColumn』に移動しました」のみ（state は新 project に切替済みのため取消アナウンスは流さない） | 「プロジェクトが切り替わりました」 |

## DetailPanel の field 編集と楽観更新

DetailPanel 上で `status` / `priority` / `labels` を編集すると、UI は IPC（`update_task`）の応答を待たずに即時反映される（楽観更新）。
IPC が失敗した場合は編集前の値に自動ロールバックし、画面右上にエラートーストを表示する。
成功時も成功トーストを 1 件表示する。
ファイル監視で外部から同じタスクが書き換えられたケースでも、楽観中のキーが既に外部値で上書きされていればロールバックは行わない（外部値を優先する整合性ルール）。

## DetailPanel の削除フロー

DetailPanel の「削除」ボタン押下で確認ダイアログを表示する。対象タスクが子タスクを持つかで分岐する。

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
- **検索・フィルタリング機能はMVPスコープ外**（ラベル、優先度、キーワードによるタスク絞り込みはV2以降で検討）

## 関連仕様

- [config-spec.md](./config-spec.md) - カラム設定・カード並び順の永続化仕様
- [task-card-spec.md](./task-card-spec.md) - タスクカードの表示内容・詳細パネル・フォーム仕様
- [file-system-spec.md](./file-system-spec.md) - ファイル監視・変更検知の仕組み
- [task-format-spec.md](./task-format-spec.md) - mdファイルのフォーマットとフロントマターの定義
