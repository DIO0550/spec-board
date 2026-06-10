# タスク作成画面（全画面2ペイン＋ライブプレビュー）の実装方針

対象 Issue: #270 / spec: `019-task-create-screen-layout`

新規タスク作成 UI を、旧 480px モーダル（`TaskCreateModal`）から Issue 詳細と同じ
**全画面2ペイン（`TaskCreateScreen`）＋ライブプレビュー**へ刷新した。ここでは「なぜそう書いたか」
を記録する。仕様（何を実現するか）は `docs/spec-board/board-view-spec.md` を参照。

## 全体構成

```
src/
  domains/markdown/                  ← detail 内部から共有移設（parse / toggle 等の純関数）
  components/
    BodyTaskProgress/                ← 本文タスクリスト進捗バー（共有移設）
    MarkdownContent/                 ← 本文を純表示する共有部品
      index.tsx                      ← MarkdownContent（編集不可）
      renderBlock.tsx                ← Block→JSX 描画（MarkdownBody と共有）
  features/task-form/
    lib/buildPreviewFrontmatter/     ← frontmatter 組み立て純関数 + PreviewFrontmatterInput 型
    components/
      TaskForm/                      ← onValuesChange（値伝搬）を追加
      PreviewPane/                   ← Raw/Rendered トグルのプレビュー
      TaskCreateScreen/              ← 2ペインシェル（旧 TaskCreateModal の契約を継承）
  hooks/useAppView/
    index.ts                         ← AppView union に "create" を追加
    resolveCloseTarget.ts            ← create 閉じ時の戻り先解決（純関数）
```

## なぜ markdown を `src/domains/` へ共有移設したか

プレビュー（task-form）は detail と同じ markdown レンダリングを使う。detail 内部の
非公開モジュールを task-form から直接 import すると **feature 境界違反**になる。
そこで `Markdown` ドメイン（parse 等）を `src/domains/markdown` へ、本文描画（`renderBlock`）と
進捗バー（`BodyTaskProgress`）を `src/components/` へ移設し、detail / task-form 双方が
共有層を経由して使う形にした。

`renderBlock` は checkbox の操作可否を `RenderBlockOptions`（`interactive` / `onToggle`）で
受け取る単一定義とし、編集可能な detail の `MarkdownBody` と純表示の `MarkdownContent` で
共有する。`MarkdownContent` は `READONLY_RENDER_OPTIONS`（checkbox 無効・toggle は no-op）を
渡すだけで、描画ロジックの二重定義を避けている。

## なぜ値の持ち上げを `useEffect` 通知にしたか（key 再 mount ではなく）

`useTaskFormFields` は「**mount 後 props 不変前提**」で初期化関数のみ `initialStatus` /
`initialParent` を参照する（sync する useEffect を持たない）。プレビューへ値を渡すために
`key` を付け替えて再 mount すると、この前提が崩れ入力中の state が飛ぶ。

そこで `TaskForm` に `onValuesChange?` を追加し、`fields.state.values` / `labels.state` /
`links.links` の変化を依存配列に持つ `useEffect` で集約値を親へ通知する。これにより
フィールド state を保持したまま（再 mount せず）プレビューへ値を伝搬できる。
`useEffect` は mount 直後にも一度発火するため、初期値（initialStatus 等）もプレビューに乗る。

呼び出し側（`TaskCreateScreen`）は依存に入る `onValuesChange` に**参照安定な state setter**
（`setPreviewValues`）を直渡しする契約とし、インライン関数で無限ループにならないようにしている。

### 未コミット label の扱い

`labels.state.labels` だけだと Enter/blur 前の `labelInput` がプレビューに出ず、送信時の
`finalizeLabels()` が取り込む最終形とプレビューが食い違う。effect では dispatch しない pure な
`LabelsField.finalize(labels.state)` を使い、未確定ラベルもプレビューに含める（送信結果と一致）。

## プレビュー値の型（branded `Priority` を避ける）

プレビューへ渡す値は `TaskFormValues`（branded `Priority` を含む）ではなく
`PreviewFrontmatterInput & { body: string }`（`priority?: string`）に統一した。
`fields.state.values.priority` は `PriorityField = Priority | ""` で、未選択時の `""` を
許容する `string` 型でないと型が通らないため。`buildPreviewFrontmatter` も `priority` を
`string` として受け、空文字/未指定は行を省略する。

`buildPreviewFrontmatter` は Rust `task::frontmatter::serialize` に**見た目を寄せる軽量実装**で、
フィールド順（title→status→priority→labels→parent→links）と空値省略のみ寄せ、
YAML エスケープ（`serde_yaml_ng` 完全一致）は追わない。プレビュー目的のため値にコロン・改行・
先頭 `#` を含むと表示は崩れるが実害はなく、「崩れ方を固定する」回帰テストで将来のエスケープ
対応時の差分を検知できるようにしている。

## 全画面ビュー化に伴う閉じ操作と戻り先（Esc 調停の廃止）

旧モーダルは detail に重ねて表示されたため、`isUpperModalOpen` で detail 側の Esc を
抑止する調停が必要だった。全画面 `create` ビューでは detail が unmount されるため、この調停は
**成立しない**。`TaskCreateScreen` は `isUpperModalOpen` を持たず、Esc/キャンセルの抑止条件を
送信中（`isSubmitting`）のみとした。

戻り先は App 側で退避する `returnView` / `returnTaskId` に委ねる。board の「+」起点は board、
detail の「サブIssue追加」起点は元の detail（親タスク）へ戻す。閉じ時の戻り先解決は純関数
`resolveCloseTarget` に切り出し、unit テスト可能にした（`returnView==="detail"` かつ
`returnTaskId` があれば detail 復帰、それ以外は returnView へ）。App.tsx の board 描画条件には
`view !== "create"` を加え、board と `TaskCreateScreen` が二重描画されないようにしている。

## 送信契約（旧 TaskCreateModal から継承）

- 二重送信ガード: `submittingRef`（同期）で多重 submit を弾く。
- 送信成功で自動クローズ（`onClose` → App が `returnView` へ戻す）。
- reject 時は閉じない（親側でトースト通知済み、画面は留まる）。
- 送信中は入力欄・ボタン・Esc・閉じ操作を無効化する。
- 重複判定（DUPLICATE）・親フィールド非表示・親 readOnly のエッジは `TaskForm` 側にそのまま委譲。
