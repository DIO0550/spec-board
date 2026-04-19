/**
 * オブジェクトの値からユニオン型を作る。
 * `as const` と組み合わせて enum 相当の型を定義するのに使う。
 *
 * @example
 * const Mode = { Display: "display", Edit: "edit" } as const;
 * type Mode = ValueOf<typeof Mode>;
 * // => "display" | "edit"
 */
export type ValueOf<T> = T[keyof T];
