# 実装メモ: detail feature の Provider 化（DetailProvider / DeleteFlowProvider）

`DetailScreen` 配下の props 素通しを context に置き換えた背景と判断を残す。`docs/spec-board/task-card-spec.md` 等が「何が起きるか」、ここでは「なぜそう書いたか」を扱う。画面の挙動・データ形式に変更はなく、純粋な内部構成のリファクタリングである。

## 何が問題だったか

旧構成では `DetailScreen → PropertiesSidebar → DetailFields.* → SubIssueSection / LinksSection` の 4 階層を、`allTasks` / `onAddSubIssue` / `onSelectTask` / `onAddLink` / `onRemoveLink` などが「受け取って、そのまま子に渡すだけ」で通過していた（いわゆる props ドリリング）。`PropertiesSidebar` は 16 個の props を受け取るが、自分で使うのは `task`（担当者・期限の表示）と `onArchive` だけだった。

さらに削除フローの所有権が割れていた。確認ダイアログの state（`useDeleteFlow`）と `orphanStrategy` の `useState` は `DetailScreen` にあり、それを操作する削除ボタン・`ConfirmDialog`・orphan ラジオは `PropertiesSidebar` にあった。JSDoc で「所有権は DetailScreen」とわざわざ明示しなければ読めない構造になっていた。

board feature は同じ問題を `BoardCardProvider`（`index.tsx` + `wrapper.tsx` + `storybook/decorator.tsx` + `__tests__/`）で解決済みなので、その規約を detail feature にも適用した。

## Provider の置き場所

2 つの Provider は `src/features/detail/providers/` に置いた（`components/` ではない）。理由は次の 2 点。

- **`src/providers/` には置けない**: `src/providers/` は App ルートで 1 回だけマウントするアプリ横断の状態（toast / project / view）の置き場で、いずれも `@/features/...` を import していない。`DetailProvider` は detail feature の hook（`useChildTasks` 等）を呼ぶため、ここに置くと「共通層 → feature 内部」の依存が生まれる。マウント位置も `DetailScreen` の内側で task ごとに被せるものなので、性質が違う
- **`components/` とも分ける**: Provider は UI を描画せず context を配るだけで、コンポーネントとは責務が異なる。feature 内に `providers/` サブフォルダを切って「この feature の Provider はここ」と一意に決める

board feature の `BoardCardProvider` / `BoardColumnProvider` / `BoardProviders` は `components/` 配下のままなので、揃えるなら別 Issue で `features/board/providers/` へ移す。

## なぜ Provider を 2 本に分けたか

`DetailProvider`（表示対象データ・派生値・編集ハンドラの配信）と `DeleteFlowProvider`（削除確認 state + `orphanStrategy` の所有）の 2 本にした。

React の context は「Provider の `value` が変わると、その context を読んでいる全 consumer が再レンダーされる」仕組みになっている。1 本にまとめると、削除ダイアログで orphan ラジオを切り替えるたびに `value` オブジェクトが作り直され、削除とは無関係な `DetailFields.StatusPriority` / `Labels` / `Links` まで再レンダーされる。

分けておけば、`DeleteFlowProvider` の `setState` で再レンダーされるのは `useDeleteFlowContext()` を読んでいる `PropertiesSidebar` と `DetailScreenContent` だけになる。`DetailFields.*` は `useDetail()` しか読まないので影響を受けない。この挙動は `DeleteFlowProvider.state.test.tsx` の「requestDelete による state 変更で DetailProvider の consumer が再レンダーしない」で検証している。`ToastProvider` が state と dispatch を 2 本の context に分けて再レンダーを抑えているのと同じ考え方である。

逆に、`DetailProvider` の value を「data」「handlers」の 2 context に分ける案は採らなかった。`handlers` は `task.id` と `onTaskUpdate` にしか依存せず、`task` が変わればどのみち data 側も変わるため、分けても再レンダー回数は減らない。

## なぜ DetailScreen が「殻」と「Content」の 2 段になったか

`DetailScreen` は `DetailProvider` と `DeleteFlowProvider` を返すだけの「殻」になり、実際の JSX（subbar / 本文 / プロパティ）は同じファイルの非 export コンポーネント `DetailScreenContent` に移した。

理由は React の制約にある。`useContext` は **その Provider より下の階層** でしか値を読めない。`DetailScreen` 自身は Provider を「返す」関数なので、その関数の中で `useDeleteFlowContext()` を呼んでも Provider の外側にいることになり、値を読めない（`useDetail` / `useDeleteFlowContext` は Provider 外で呼ぶと throw する）。

一方で `DetailScreen` は `useEscToClose` の `disabled` に「削除ダイアログが開いているか（`isOpen`）」を渡す必要がある。ダイアログ表示中に Esc を押しても一覧に戻らないようにするためで、`DeleteFlowProvider` が state を所有する以上、`isOpen` は Provider の内側でしか読めない。そのため、Provider の内側にもう 1 つコンポーネントが必要になった。

`DetailScreenContent` を別ファイルにしなかったのは、`DetailFields` のサブ部品と同じ配置方針（同一ファイル・非 export）に揃えたため。`DetailScreenProps` の型構成は変えていない（`onDelete` / `onAddLink` / `onRemoveLink` のインライン型を `DeleteTaskHandler` / `AddLinkHandler` / `RemoveLinkHandler` の alias に差し替えたのみ）ので、`App.tsx` の配線と `DetailScreen.*.test.tsx`（48 件）は無改修のまま回帰テストとして機能する。

## なぜ DetailFieldsContext を廃止したか

旧 `DetailFields` は Root（`<DetailFields task columns handlers>`）が独自の context（`DetailFieldsContext`）を張り、サブ部品がそれを読んでいた。`DetailProvider` を導入するとこれが二段重ねになる（`DetailProvider` → `DetailFields` Root → サブ部品）。Root の props は `DetailProvider` から読んだ値をそのまま流すだけになるため、`DetailFieldsContext` を廃止し、サブ部品は `useDetail()` を直接読む形にした。

Root（`<DetailFields>`）自体は残している。完全に消して `DetailFields` を素の名前空間オブジェクトにする案もあったが、その場合 `PropertiesSidebar` の呼び出し形と stories の `component: DetailFields` を変える必要があり、差分の割に得るものが無い。Root は「配置を呼び出し側に委ねる Fragment コンテナ」として振る舞い、Compound の名前空間（`DetailFields.StatusPriority` 等）はそのまま使う。

副次的に、`DetailFields.SubIssue` / `DetailFields.Links` は props を持たなくなった。従来 `PropertiesSidebar` にあった表示条件（「`onAddSubIssue` と `allTasks` が揃っているか」「`onAddLink` と `allTasks` が揃っているか」）は各サブ部品の内側に移り、条件を満たさなければ `null` を返す。これにより `PropertiesSidebar` は純粋にレイアウト（並び順）だけを決める。

## なぜ派生計算を Provider に置いたか

`useChildTasks` / `useParentTask` / `useDetailFieldHandlers` / `BrokenLinkSet.from` の呼び出しは `DetailScreen` から `DetailProvider` の内部に移した。`BoardCardProvider` が `tasks / allTasks / projections` の生データを受けて `byPathMap` 等の lookup を内部で派生させているのと同型である。

「`DetailScreen` が hook を呼び、Provider は計算済みの値を配るだけにする」案は採らなかった。Provider が薄くなる一方で、`DetailScreen` の責務（画面構成のみ）が守られず、テスト用 wrapper と Storybook decorator の引数に `childInfo: UseChildTasksResult` のような手書き fixture が必要になって実挙動から遠いテストになる。生データを受ける形なら wrapper / decorator の引数は `task / allTasks / projections / tasksByNormalizedPath` で済み、旧 `detailChildInfo` / `detailHandlers` / `noBrokenLinks` / `idleDeleteFlow` といった fixture が丸ごと不要になった。

### 参照安定性（useMemo）の前提

`DetailProvider` は `api` オブジェクトを `useMemo` で 1 つにまとめて配る。`useMemo` は依存配列の要素を `Object.is` で比較するため、依存に入る `childInfo` / `handlers` が毎レンダー新規オブジェクトだと毎回 miss して意味が無い。そこで `useChildTasks` / `useDetailFieldHandlers` の戻り値オブジェクトも `useMemo` で包む変更を同時に入れた。

同じ理由で `labelSuggestions` 未指定時は固定参照の空配列（`EMPTY_LABEL_SUGGESTIONS`）にフォールバックしている。デフォルト引数に `[]` を書くと毎レンダー新しい配列になり、memo が毎回 miss する。

React 初心者向けに補足すると、`onTaskUpdate` の参照が変わると `handlers`（`useCallback` の依存に `onTaskUpdate` が入っている）経由で `api` も必ず作り直される。`DetailScreen` に渡す `onTaskUpdate` をインライン関数で書くと consumer 全体が毎レンダー再描画されるので、呼び出し側（`App.tsx`）は `useCallback` で安定させた関数を渡す前提になっている。

### `useDetailFieldHandlers` に title / body を足した理由

`DetailBody` の `onTitleConfirm / onBodyConfirm` は従来 `DetailScreen` で `(title) => onTaskUpdate(task.id, { title })` とインラインで作っていた。`DetailScreenContent` から `onTaskUpdate` を使うには生の `onTaskUpdate` を context に載せる必要があるが、「タスクを編集する操作は全て `handlers` に集約されている」という API の一貫性を優先し、title / body も細粒度ハンドラとして `handlers` に足した。`DetailBody` の props は変えていない（`onTitleConfirm={handlers.onTitleChange}` と渡すだけ）。

## DeleteFlowProvider の設計

`DeleteFlowProvider` は `DetailProvider` に依存せず、`task` と `onDelete` を自分の props で受ける。単体でテスト・Storybook 表示でき、依存の向きを増やさない。`DetailScreen` は `task` を両 Provider に渡すことになるが、`BoardProviders` が `tasks / allTasks` を両 Provider に同値で配線しているのと同じである。

内部は旧 `DetailScreen` にあった `orphanStrategy` の `useState` / `handleDelete` / `requestDelete` ラッパをそのまま移したもので、`useDeleteFlow` と `DeleteFlow` domain は変更していない。`requestDelete` は `orphanStrategy` を `"clear"` に戻してから `useDeleteFlow` の `requestDelete` を呼ぶ（ダイアログを開き直すたびにラジオが既定値に戻る）。`confirmDelete` は子タスクの有無で `onDelete(id, orphanStrategy)` / `onDelete(id)` を切り替える。

consumer hook 名は `useDeleteFlowContext` とした。`BoardCardProvider → useBoardCard` の命名規則に従えば `useDeleteFlow` だが、Provider 内部で再利用する既存 hook と衝突するため、context 側に `Context` 接尾辞を付けて区別している。

## テストと Storybook での Provider の被せ方

### テスト: `createDetailWrapper` / `createDeleteFlowWrapper`

`@testing-library/react` は未導入のため、wrapper は `root.render(<Wrapper><Target/></Wrapper>)` の形で使う。渡さなかった prop は既定値（`makeTask` / `initialColumns` / `TaskProjection.emptyMap` / no-op）で埋まる。

```tsx
const Detail = createDetailWrapper({ task, allTasks: [parent, task], onSelectTask: vi.fn() });
const DeleteFlow = createDeleteFlowWrapper({ task, onDelete });
root.render(
  <Detail>
    <DeleteFlow>
      <PropertiesSidebar />
    </DeleteFlow>
  </Detail>,
);
```

`createDetailWrapper` の既定値に `allTasks` / `onAddSubIssue` / `onAddLink` は意図的に含めていない。未指定だと SubIssue / Links セクションが描画されない、という本番と同じ条件で mount するためで、これらを出したいテストは明示的に渡す。

### Storybook: `withDetailProvider` / `withDeleteFlowProvider`

`decorators` 配列に並べる。Storybook の `decorators` は **配列の後ろが外側** になる点に注意する。`PropertiesSidebar` の stories では `[枠 div, withDeleteFlowProvider, withDetailProvider]` の順に並べ、`DetailProvider > DeleteFlowProvider > 枠 div > Story` の入れ子にしている。

story 単位の `decorators` は meta のものに **追加**（内側に挿入）される。`EdgeCases` story で別のタスクを表示したい場合、story 側に Provider decorator を置くと内側の Provider が勝つ。

`DeleteConfirmation` story はダイアログを開いた状態を `play` 関数で削除ボタンをクリックして作る。`DeleteFlowProvider` に「初期状態を confirming にする」テスト専用 prop を足すと本番 API が汚れるため、`Board/index.stories.tsx` の `Dragging` story が `play` + `fireEvent` で DnD 状態を作っている前例に倣った。
