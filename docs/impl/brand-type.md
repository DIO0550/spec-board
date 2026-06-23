# Brand 型ユーティリティ実装ガイド

## 何を提供するか

`src/types/brand.ts` に汎用 nominal 型ユーティリティ `Brand<T, Name>` を 1 つだけ提供する。

```ts
export type Brand<T, Name extends string> = T & {
  readonly [brandSymbol]: { readonly [K in Name]: K };
};
```

これにより、1 行で「名前で区別された型」を宣言できる:

```ts
import type { Brand } from "@/types/brand";

type TaskId = Brand<string, "TaskId">;
type MilestoneId = Brand<string, "MilestoneId">;
```

主な性質は次の 4 つ:

- 元の型 `T` への widening（`TaskId` → `string`）は OK。
- 逆の narrowing（`string` → `TaskId`）は型エラー（`as` キャストが必要）。
- 異なる `Name` 同士は相互非互換（`TaskId` ↔ `MilestoneId` の代入はどちらも型エラー）。
- スタック可能: `Brand<Brand<string, "A">, "B">` のように積み重ねられる。

## なぜこの形か

TypeScript の型システムは構造的部分型なので、`type TaskId = string` のような単純な別名を作っても、コンパイラは `string` と `TaskId` を完全に同じ型として扱う。同じ string ベースの ID 同士を取り違えても検出できない。これを「名目的（nominal）に」区別するために、実体としては存在しない `unique symbol` をキーに使った見えない印（タグ）を交差型で付与する、というのが Brand パターンの基本アイデアである。

`Brand<T, Name>` のポイントは次の 3 つ。

### モジュールスコープに `unique symbol` を 1 本だけ宣言する

```ts
declare const brandSymbol: unique symbol;
```

`declare const` は実行時には**存在しない**宣言で、コンパイル後の JS には残らない。これにより、

- `[brandSymbol]` プロパティを持つ「ふり」をする型を作っても、ランタイムオーバーヘッドはゼロ。
- `tsconfig.json` の `noUnusedLocals: true` 下でも警告にならない（TypeScript の仕様。`declare const` は宣言扱いで未使用判定の対象外）。

各 Brand 型ごとに symbol を分ける必要はない。1 本の symbol を共有し、Name パラメータで識別する。

### `Name extends string` を最小制約に置く

`Name` は通常リテラル型（`"TaskId"` のような文字列リテラル）を受け取る。型エラーを起こすメッセージに `Name` の文字列がそのまま現れるため、デバッグしやすい。

> **注意**: `string` 自体（広い型）を渡してはいけない。[アンチパターン](#アンチパターン) 参照。

### 内部表現に Mapped Type を使う

```ts
{ readonly [brandSymbol]: { readonly [K in Name]: K } }
```

`{ [K in Name]: K }` は Mapped Type で、`Name = "TaskId"` のときは `{ TaskId: "TaskId" }` 相当のオブジェクト型になる。スタック時の振る舞いがポイントになる:

```ts
type Stack = Brand<Brand<string, "A">, "B">;
//   = string
//     & { [brandSymbol]: { A: "A" } }
//     & { [brandSymbol]: { B: "B" } }
//   = string
//     & { [brandSymbol]: { A: "A" } & { B: "B" } }
//   = string
//     & { [brandSymbol]: { A: "A", B: "B" } }
```

同じプロパティキー `[brandSymbol]` の交差は値型の交差に降りる。Mapped Type 同士の交差は**キーが積み上がる**ため、スタックすると Name キーが結合される。

もし単純な `T & { [brandSymbol]: Name }` 形式（値型に Name 文字列をそのまま入れる）だと、スタック時に `[brandSymbol]: "A" & "B"` となり、`"A" & "B" = never` に簡約されてしまう。`never` は bottom type として「任意の型に代入可能」なため、無関係な `Brand<string, "C">` への代入まで通ってしまい、nominal safety が崩れる。Mapped Type を使うのはこの落とし穴を回避するためである。

## 使い方

### 1. ID 型を nominal に区別する

```ts
type TaskId = Brand<string, "TaskId">;
type MilestoneId = Brand<string, "MilestoneId">;

declare const TaskId: {
  parse: (raw: string) => TaskId | undefined;
};

const id = TaskId.parse("task-1");
if (id !== undefined) {
  // id: TaskId として安全に扱える
  saveTask(id);
}

declare function saveTask(id: TaskId): void;
saveTask("task-2"); // 型エラー: string は TaskId に代入できない
```

ポイント:

- 値の生成は companion 関数 (`TaskId.parse` 等) に閉じる。`as TaskId` キャストはこの内部に閉じ込め、呼び出し側で書かない。
- `saveTask` の引数を `string` ではなく `TaskId` にすることで、未検証の string を渡すミスが型エラーになる。

### 2. 検証済み値の段階的絞り込み（スタック）

`Brand` は積み重ねできるので、「検証段階」を型で表現できる。

```ts
type KebabCase = Brand<string, "KebabCase">;
type UniqueFileName = Brand<KebabCase, "UniqueFileName">;

declare const FileName: {
  toKebab: (raw: string) => KebabCase;
  ensureUnique: (base: KebabCase, existing: ReadonlySet<string>) => UniqueFileName;
};

const kebab = FileName.toKebab("My Task");
const unique = FileName.ensureUnique(kebab, new Set(["my-task"]));

const k: KebabCase = unique;   // OK: 二段目を一段目に widening
const plain: string = unique;  // OK: 二段ぶん widening
```

逆向き（`KebabCase` → `UniqueFileName`、`string` → `UniqueFileName`）は型エラーになる。「衝突回避まで完了している」ことを型で保証できる。

### 3. 非 string 型にも適用

`T` は無制約なので、number / 配列 / オブジェクトなど何でも Brand 化できる。

```ts
type Year = Brand<number, "Year">;
type Tags = Brand<readonly string[], "Tags">;
type Config = Brand<{ debug: boolean }, "Config">;
```

## 既存 Brand 3 箇所との関係

本ユーティリティ導入時点では、既存の以下 3 箇所は**置き換えない**:

- `src/domains/task-file-name/index.ts` — `TaskFileName`
- `src/domains/due/index.ts` — `Due`
- `src/features/task-form/lib/fields/fileName/index.ts` — `FileNameField`

これらは個別に `declare const xxxBrand: unique symbol` を持つ旧式パターンだが、機能的には等価なので、今すぐ書き換える必要はない。将来的に `Brand<string, "TaskFileName">` の形へ寄せる場合は後続 spec で行う。

## 代入可能性マトリクス

`A = Brand<string, "A">`、`B = Brand<string, "B">`、`AB = Brand<Brand<string, "A">, "B">` として:

| from \ to | `string` | `A` | `B` | `AB` | `Brand<string, "C">` |
|-----------|----------|-----|-----|------|----------------------|
| `string`  | OK       | NG  | NG  | NG   | NG                   |
| `A`       | OK       | OK  | NG  | NG   | NG                   |
| `B`       | OK       | NG  | OK  | NG   | NG                   |
| `AB`      | OK       | OK  | OK  | OK   | NG                   |

ルール:

- **widening（Brand → 元の型 / 上位 Brand）**: 常に OK。
- **narrowing（元の型 → Brand）**: 常に NG。生成は cast で行う（companion 内）。
- **Name 不一致（横移動）**: NG。`[brandSymbol]` の値型が要求するキーセットが異なる。

## アンチパターン

### `brand()` / `unbrand()` ヘルパを作らない

```ts
// やらない
export const brand = <T, N extends string>(v: T): Brand<T, N> => v as Brand<T, N>;
```

理由:

- 生成位置を 1 箇所に閉じ込められない（呼び出し側で `brand<string, "TaskId">(raw)` のように何処でも書けてしまう）。
- 検証ロジックと cast を引き剥がしてしまい、「validate を通っていない値を Brand する」ミスを誘発する。

代わりに、各 Brand 型は対応する companion 関数（`TaskId.parse` / `Due.parse` 等）の中でのみ `as TaskId` を許す運用にする。

### companion 層以外で cast しない

```ts
// やらない（feature 層で生 string を cast）
const id = rawInput as TaskId;
saveTask(id);
```

`as` キャストはコンパイラの型検査をすり抜けるため、validate なしの値を Brand 型に詰めてしまうと、型システムが提供する保証が崩れる。validate と cast はセットで domain 層の companion に閉じる。

### 第 2 引数に `string` を渡さない

```ts
// やらない
type Bad = Brand<string, string>;
```

`Name extends string` という制約は最小の型制約に過ぎず、`Name = string` を許す。しかし `string` を渡すと:

- `{ [K in string]: K }` は `{ [k: string]: string }` 相当のインデックスシグネチャ型になり、特定の Name キーで区別する nominal 性が失われる。
- 全ての `Brand<T, string>` が相互代入可能になり、Brand を導入した意味が消える。

必ず文字列リテラル型（`"TaskId"` / `"Year"` 等）を渡すこと。
