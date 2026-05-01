/**
 * Rust 風の Option 型。値の有無を表す判別共用体。
 * `null` / `undefined` の代わりに使い、API 境界での値欠落を明示する。
 */
export type Some<T> = { readonly some: true; readonly value: T };
export type None = { readonly some: false };
export type Option<T> = Some<T> | None;

/** Option の companion API。 */
export const Option = {
  /**
   * 値あり (Some) を生成する。
   * @param value 包む値
   * @returns Some<T>
   */
  some: <T>(value: T): Some<T> => ({ some: true, value }),

  /**
   * 値なし (None) を生成する。
   * @returns None
   */
  none: (): None => ({ some: false }),

  /**
   * Some 判定（型述語）。
   * @param o 判定対象の Option
   * @returns Some<T> なら true
   */
  isSome: <T>(o: Option<T>): o is Some<T> => o.some,

  /**
   * None 判定（型述語）。
   * @param o 判定対象の Option
   * @returns None なら true
   */
  isNone: <T>(o: Option<T>): o is None => !o.some,

  /**
   * Some のみ値を変換する。None はそのまま返す。
   * @param o 変換元 Option
   * @param fn 値変換関数
   * @returns 変換後の Option
   */
  map: <T, U>(o: Option<T>, fn: (value: T) => U): Option<U> =>
    o.some ? { some: true, value: fn(o.value) } : o,

  /**
   * Some なら value、None なら defaultValue を返す。
   * @param o 取り出し元 Option
   * @param defaultValue None の場合の代替値
   * @returns Some の値 または defaultValue
   */
  unwrapOr: <T>(o: Option<T>, defaultValue: T): T =>
    o.some ? o.value : defaultValue,

  /**
   * null / undefined を None、それ以外を Some に正規化する。
   * @param v 任意の値（null / undefined を含む）
   * @returns 正規化された Option
   */
  fromNullable: <T>(v: T | null | undefined): Option<T> =>
    v === null || v === undefined ? { some: false } : { some: true, value: v },

  /**
   * some / none 各々のハンドラを呼び分けて値を返す（pattern match 風）。
   * @param o 分岐対象 Option
   * @param handlers some / none 用のハンドラ
   * @returns ハンドラの戻り値
   */
  match: <T, R>(
    o: Option<T>,
    handlers: { readonly some: (value: T) => R; readonly none: () => R },
  ): R => (o.some ? handlers.some(o.value) : handlers.none()),
} as const;
