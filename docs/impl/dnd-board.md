# 実装メモ: Native DnD Board

カンバンボードのカード Drag and Drop を、外部ライブラリを入れずに HTML5 ネイティブ DnD API のみで実現したときの設計判断を残す。`docs/spec-board/board-view-spec.md` が「何が起きるか」、ここでは「なぜそう書いたか」を扱う。

## ライブラリを入れない理由

`@dnd-kit/*` 等の DnD ライブラリは強力だが、本アプリの DnD 要件はシンプル（カード単位の並び替え + カラム間移動のみ）で、ネイティブ API で十分賄える。依存追加によるバンドルサイズ増 / バージョン追従コスト / ライブラリ独自の状態管理を学ぶコストを避け、Web 標準で完結させる方針とした。

## DragState を Project state に持たない

ドラッグ中の hover 位置や draggingTaskFilePath は **Board ローカルの useReducer** に置き、`useProject` の state には載せていない。

理由:

- ドラッグ中は per-pixel で更新が走るため、project state に置くと無関係なコンポーネントまで再 render される
- DragState は IPC 確定前の一時的な UI 状態であり、永続化する必要が無い
- 「project の真実」と「進行中の操作」を分離することで、reducer のテストが純粋に保てる

## 楽観的 UI 更新を採用しない

drop 直後にローカルで先に並び替えてから IPC を投げる「楽観 UI」は採用しなかった。

- 既存の `createTask` / `updateTask` / `deleteTask` が IPC 完了後 dispatch のパターンで統一されており、それと整合させたい
- 失敗時のロールバックロジックを書くと、ローカルでの並び替え状態と IPC 失敗時の真実状態の整合を取る複雑度が増える
- IPC は数十 ms オーダーで完了するため、体感上の問題は無い

## 3 連 IPC を避ける（旧カラム cardOrder の自動メンテ）

カラム間移動の素朴な設計は次の 3 連だった:

1. `update_task({ status: toColumn })`
2. `update_card_order(fromColumn, ...)` — 旧カラムから外す
3. `update_card_order(toColumn, ...)` — 新カラムに挿入

これを **2 連 IPC** に削った:

1. `update_task({ status: toColumn })`
2. `update_card_order(toColumn, ...)`

旧カラムの cardOrder は **BE 側 watcher が status 変更を検知して自動除去する**契約とした（BE 実装 issue 側で明文化）。クライアント側で旧カラム向けの `update_card_order(fromColumn, ...)` を発行しないことで、レースコンディションが減り、reducer dispatch も 2 段で済む（残る IPC は `update_task` と `update_card_order(toColumn, ...)` の 2 つ）。

## `buildMovedFilePaths` を純粋関数として切り出す

toIndex 計算には次の罠がある:

- 同一カラム内で「元 index < toIndex」のとき、元 task を除外せずに insert すると重複や位置ズレが起きる
- toIndex が `tasks.length` を超える可能性がある（hover 計算の境界と挿入境界が別）

これらを「同一カラムの hover index 補正 → target 除外 → clamp → 挿入」で一括処理する純粋関数として切り出した。Action 層 (`moveTaskAction`) からのみ呼ばれる feature レイヤの helper であり、`domains/project-data` の `applyCardOrderUpdated` はこの関数に依存しない（domain 側は IPC 確定後の filePaths を入力として受け取る）。テストもこの 1 関数に集約できる。

## `applyCardOrderUpdated` を ProjectData の companion に追加する

並び順反映ロジックは `domains/project-data` の companion API に inline で追加した（`Impl` ラッパは作らない）。理由:

- `applyTaskCreated` / `applyTaskUpdated` / `applyTaskDeleted` と隣接配置することで、ドメインルールの一貫性が読みやすくなる
- reducer から呼ぶ際の経路が短い（`ProjectSessionState.updateData(state, (data) => ProjectData.applyCardOrderUpdated(...))` の 1 行）
- companion オブジェクトの責務（pure data transform）に完全に合致する

## 「並び順変化なし」は IPC を呼ばない

drop 後の filePaths を計算した結果、現状と完全一致なら `Result.ok(undefined)` で no-op return する。BE / ファイルシステムへの不要な書き込みと watcher 由来の余計な再 render を防ぐ。

## DragLikeEvent をテストヘルパーに

happy-dom 20 は `DragEvent` クラスを提供しない。`Event` のサブクラス `DragLikeEvent` を `src/test-fixtures/createDragEvent.ts` に置き、`dataTransfer` / `clientX` / `clientY` をインスタンスフィールドとして持たせた。

旧来の `Object.defineProperty` で後付け注入する書き方は、繰り返しが多く `readonly` の意味も型レベルで表現できない。サブクラス化することで宣言的になり、`instanceof DragLikeEvent` でテスト内のマッチングも書きやすくなる。

## drag 直後の synthetic click を抑止する

`role="button"` の TaskCard はクリックで詳細パネルを開く。HTML5 ネイティブ DnD は `dragend` 直後に同位置の `click` イベントを synthetic に発火させるため、ドロップしただけで詳細パネルが意図せず開いてしまう。

`dragGuardRef` を `true` に立て、`dragend` で `setTimeout(..., 0)` で 1 macrotask 後に解除することで、間に挟まる synthetic click だけを `onClick` から弾く。

## カラム DnD はタスク DnD とは別ドメインで組む

ColumnHeader を `draggable=true` ハンドルにしてカラムを並び替えるとき、設計判断として以下を採用した。

### カラム識別は `columnName` ベース

`data.columns` の配列順 ≠ 表示順という不変条件がある（reducer は配列順を保持し、表示は `[...columns].sort((a,b) => a.order - b.order)`）。さらに queue 待ち中に add / delete / rename が割り込むと、配列 index は別カラムを指す可能性がある。

そこで DnD payload には **fromColumnName / toColumnName**（文字列）を載せ、effect 側で「採取時点の最新 `current.columns` を order 昇順に並べ、name → index を再解決」する。`fromColumnName` が消えていたら `Result.ok({ applied: false })` を返し、dispatch / IPC / callback 一切起こさない。

### MIME 分離 (`application/x-spec-board-column`)

タスク DnD の MIME (`application/x-spec-board-task`) と衝突しない独自 MIME を採用する。Column の dragover / drop は最初に column MIME をチェックし、column 経路なら early return することで cross-MIME を弾く。

### DragState 分離

タスク用 `dragState.ts` とは独立した `columnDragState.ts` を新設。初期実装では `hoverColumnName` を視覚反映に使わないが、将来 hover プレースホルダ表示を導入する余地として reducer 内に保持する。

### 2 段構成（Snapshot pure / Execution effect）

`MoveSnapshot` / `MoveExecution` を踏襲し、`ReorderSnapshot`（pure: 並び替え前後の columns 配列 / 移動カラム名 / 表示順上で解決した index / no-op 判定）+ `ReorderExecution`（effect: 楽観 dispatch → IPC → 失敗時 rollback dispatch + callback）に分けた。同一カラム並び替えの no-op は orchestrator preflight / snapshot 側で扱い、execution は `isNoop=false` 前提で書ける。

### 0-origin 完全正規化

drop ごとに全カラムの `order` を `0, 1, 2, ...` に振り直す。「該当 2 カラムだけ swap」だと gap 解消の機会が無く、長期的に `order` 値が大きくなる。完全正規化に倒すと毎回 N カラム書き換えになるが、カラム数は数十オーダーなので問題にならない。

`reorderColumnsByIndex(columns, fromIndex, toIndex) => Column[] | null` を最小単位の純関数として TDD で先に組み、ここに範囲外 / no-op / gap order の挙動を凝縮した。

### dragstart-level guard

ColumnHeader の子 interactive 要素（rename ボタン / menu ボタン / +追加 ボタン）に `data-column-dnd-disabled` 属性を付与し、最外殻 `onDragStart` で `event.target.closest("[data-column-dnd-disabled]")` を検出した場合は `event.preventDefault()` で dragstart 自体を中止する。

`onClick` の `stopPropagation` は dragstart の発火を止められないため採用しない。dragstart を中止すると `setData` も呼ばれず、子ボタンの click ハンドラだけが通常通り発火する。

### `runUpdateColumnsInsideQueue` 抽出

reorder の IPC は既存 `updateColumnsAction` の queue 内ロジック（version guard / doneColumn refresh / validation / 確定 dispatch）を全て継承する必要がある。queue を再 enqueue しないために、`updateColumnsAction` の queue 内処理を `runUpdateColumnsInsideQueue(deps, command, version)` helper に抽出して export し、`reorderColumnsAction` の queue 内から直接呼ぶ。

reorder の `ColumnsCommandBuilder` は **current 引数を見ず snapshot.afterColumns をそのまま返す**。これにより楽観 dispatch 適用済みの state を渡しても二重並び替えが起きない（snapshot 採取時点で name → index 解決済みのため）。

### invalid-state は rollback しない

`runUpdateColumnsInsideQueue` が `Result.err(invalid-state)` を返した場合（project switch 等）は、reducer が既に新 project の state に切り替わっているため、`beforeColumns` を流すと逆に古い columns を上書きしてしまう。rollback dispatch / callback を行わず、err をそのまま return する。それ以外（`tauri-error` 等）のみ rollback する。
