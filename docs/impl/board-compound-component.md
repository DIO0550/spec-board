# 実装メモ: Board の Compound Component 化

`Board` を `<Board>{children}</Board>` の compound component に再設計した背景と判断を残す。`docs/spec-board/board-view-spec.md` が「何が起きるか」、ここでは「なぜそう書いたか」を扱う。

## なぜ Board を compound にしたか

旧 `Board` は `columns: ColumnType[]` を受け取り、内部で

- `[...columns].sort((a, b) => a.order - b.order)` で並べ替え
- `Column` を `.map` して `key` / `order` / 各種ハンドラを bind
- `columns.length > 1` で `columnDraggable` を決定
- `onAddColumn` が指定されたときだけ末尾に `AddColumnButton` を出す

という「子に何を並べるか」を全部知っていた。実際の中身は `Column[]` と末尾の `AddColumnButton` 1 個だけしかありえないにもかかわらず、Board が configuration を介して子を組み立てていた。

compound component（`Board.Column` / `Board.AddColumn`）として alias を提供すると、呼び出し側は次のように書ける。

```tsx
<Board>
  {ordered.map((col, index) => (
    <Board.Column key={col.name} name={col.name} order={index} ... />
  ))}
  {onAddColumn && <Board.AddColumn onAdd={onAddColumn} />}
</Board>
```

このとき `Board` は children を素通しするだけのレイアウトコンテナ（外側 flex-col + 内側 flex-row）になり、「子をどう並べるか」は呼び出し側の責任になる。React 初心者向けに言えば、HTML の `<ul>` が要素として `<li>` を受け取るだけで「`<li>` をどう作るか」を知らないのと同じ構図に揃えた。

副次効果として、`Board` に対する props を増やす圧（「`columnDraggable` を外から渡したい」「`onAddColumn` だけ条件で出したい」「カラムごとに別ハンドラを持たせたい」）が無くなる。新しい子要素を増やすときは alias を `Object.assign` に足すだけで済む。

## なぜ sort を呼び出し側に移したか

旧 Board は `columns` 配列を受け取って中で sort していた。これは便利だが、次の問題があった。

- **「色」と「順番」の責務がずれる**: フォールバック色は表示順 index（0, 1, 2...）で決定する仕様で、`column.order` の生値（10, 20, ...）とは別物。にもかかわらず、その index を Board が握っていたため「config の生 order が見える人」と「表示順 index しか見えない人」が同じ階層に混在していた。呼び出し側で sort してから `Board.Column` に `order={index}` を渡す形にすると、`Board.Column` 利用者から見えるのは常に「表示順 index」だけで、混線しない。
- **テストや Storybook で並びを差し替えづらい**: Board 内で sort されると、「逆順にしたい」「sort 自体を観察したい」というとき配列で渡すしか手が無い。呼び出し側で `.map` するなら、テストや Story が JSX を直接書ける。
- **`ActiveBoardView` の責務が明示化される**: BoardWorkspace は元から「columns / handlers をどう束ねるか」を握っているレイヤーで、sort を Board の内側に隠すより、ここに集約したほうが「並び順を変えるなら BoardWorkspace」と一意に決まる。

React 初心者向けに補足すると、sort は `useMemo` で memoize したくなる場面だが、ここではあえて inline にしてある。columns の更新頻度が低く、配列の copy + sort は O(N log N) で 1 桁件数のため、memo の管理コストのほうが上回ると判断した。

## なぜ `Object.assign` パターンを採用したか

`TaskCard` / `DetailFields` が既に同じ書式

```tsx
type FooComponent = ((props: FooProps) => ReactNode) & {
  Sub: typeof Sub;
};
export const Foo: FooComponent = Object.assign(FooRoot, { Sub });
```

で揃っていたため、新しいパターンを発明する必要がなかった。コードベース内で「compound component の書式はこれ」と一意に読める利点がある。

`Object.assign` の代替として、

- `Board.Column = Column` を後から代入する: 型が `BoardComponent` まで持ち上がらず、`Board.Column` の補完が効かない。
- `React.Children.map` で子を覗き見て型を絞る: 「Board は中身を知らない」という今回の目的に逆行する。
- namespace import (`import * as Board from "./Board"`): Tree-shaking と JSX 表記の自然さが失われる。

を検討して退けた。React 19 の関数コンポーネント戻り型は `ReactNode` なので、`type BoardComponent = ((props) => ReactNode) & { Column: typeof Column; AddColumn: typeof AddColumnButton; }` で表現すれば、`<Board.Column ... />` の型推論が「`Column` を直接 import したのと完全同等」になる。

## やらなかったこと

- **`Board` の children 型を `ReactElement<typeof Board.Column | typeof Board.AddColumn>` に制限する**: Fragment / 条件レンダー (`cond && <Board.Column ...>`) / `null` を素直に書ける柔軟性を取った。runtime warning も入れていない。利用者が `<Board><div /></Board>` のような誤用を書く可能性は残るが、`Board` は「flex コンテナにそのまま流す」というプリミティブな責務しか持たないため、誤用しても壊れずに DOM が描画されるだけで済む。
- **`Column` / `AddColumnButton` 自体の compound 化**: 本改修の非対象。`Column` の中はヘッダー / リスト / ContextMenu / ConfirmDialog の複合体だが、`Board` 経由の利用パターンとして「分解して再構成したい」という要求はまだない。
- **`BoardProviders` の改修**: spec 023 で `Card` / `Column` の 2 段 Context Provider を hoist 済みのため触らない。`Board` を薄くしても Provider 構造は変わらない。
- **`columnDraggable` の自動算出**: 呼び出し側で `ordered.length > 1` を inline で書くだけなので、helper も hook も切り出さない。3 行同じものが並んだら helper を検討する程度のラインで十分。
