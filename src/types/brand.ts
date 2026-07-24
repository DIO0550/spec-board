declare const brandSymbol: unique symbol;

/**
 * 構造的型システムを補強する nominal 型ユーティリティ。
 * `string` / `number` 等のプリミティブや既存型を「名前」で区別し、
 * 誤代入を型レベルで検出する。
 *
 * 値の生成は cast で行う運用（`brand()` / `unbrand()` 等のヘルパは提供しない）。
 * 生成は domain 層の companion 関数（例: `Due.parse`）に閉じる。
 *
 * **Name には必ず文字列リテラル型を渡すこと**。`Brand<string, string>` のように
 * `string` 自体を渡すと nominal 性が失われ、全ての Brand が相互代入可能になる。
 *
 * **内部表現に Mapped Type `{ [K in Name]: K }` を使う理由**:
 * 単純な `{ name: Name }` 形式だと、`Brand<Brand<T, "A">, "B">` のスタック時に
 * `name: "A" & "B"` が `name: never` に簡約される。`never` は bottom type として
 * 任意の型に代入可能なため、無関係な `Brand<T, "C">` への代入も通ってしまい
 * nominal safety が崩れる。Mapped Type で書くと、スタック時に
 * `{ A: "A" } & { B: "B" } = { A: "A", B: "B" }` のようにキーが積み上がり、
 * `{ C: "C" }` を要求する `Brand<T, "C">` への代入は構造的に拒否される。
 *
 * @example
 * // 1. ID 型を nominal に区別する
 * type TaskId = Brand<string, "TaskId">;
 * type MilestoneId = Brand<string, "MilestoneId">;
 *
 * const taskId = "abc" as TaskId;
 * const milestoneId: MilestoneId = taskId; // 型エラー（Name が異なる）
 *
 * @example
 * // 2. 検証済み値の段階的絞り込み（スタック）
 * type KebabCase = Brand<string, "KebabCase">;
 * type UniqueFileName = Brand<KebabCase, "UniqueFileName">;
 *
 * const unique = "task-1" as UniqueFileName;
 * const kebab: KebabCase = unique;     // OK（widening）
 * const plain: string = unique;        // OK（widening）
 *
 * @example
 * // 3. 非 string 型にも適用可能
 * type Year = Brand<number, "Year">;
 * type Tags = Brand<readonly string[], "Tags">;
 */
export type Brand<T, Name extends string> = T & {
  readonly [brandSymbol]: { readonly [K in Name]: K };
};
