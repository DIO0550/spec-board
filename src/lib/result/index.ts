/**
 * Rust 風の Result 型。成功 (`ok: true`) と失敗 (`ok: false`) の判別共用体。
 * 呼び出し側は `if (!res.ok) ...` または `Result.match(res, { ok, err })` で分岐する。
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

/** Result の companion API。 */
export const Result = {
  /**
   * 成功値を包む。
   * @param value 成功値
   * @returns Ok<T>
   */
  ok: <T>(value: T): Ok<T> => ({ ok: true, value }),

  /**
   * 失敗値を包む。
   * @param error 失敗値
   * @returns Err<E>
   */
  err: <E>(error: E): Err<E> => ({ ok: false, error }),

  /**
   * 成功判定（型述語）。
   * @param r 判定対象の Result
   * @returns Ok<T> なら true
   */
  isOk: <T, E>(r: Result<T, E>): r is Ok<T> => r.ok,

  /**
   * 失敗判定（型述語）。
   * @param r 判定対象の Result
   * @returns Err<E> なら true
   */
  isErr: <T, E>(r: Result<T, E>): r is Err<E> => !r.ok,

  /**
   * 成功時のみ値を変換する。失敗はそのまま返す。
   * @param r 変換元 Result
   * @param fn 値変換関数
   * @returns 変換後の Result
   */
  map: <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
    r.ok ? { ok: true, value: fn(r.value) } : r,

  /**
   * 失敗時のみエラーを変換する。成功はそのまま返す。
   * @param r 変換元 Result
   * @param fn エラー変換関数
   * @returns 変換後の Result
   */
  mapErr: <T, E, F>(r: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
    r.ok ? r : { ok: false, error: fn(r.error) },

  /**
   * 成功なら value、失敗なら defaultValue を返す。
   * @param r 取り出し元 Result
   * @param defaultValue 失敗時の代替値
   * @returns 成功値 または defaultValue
   */
  unwrapOr: <T, E>(r: Result<T, E>, defaultValue: T): T =>
    r.ok ? r.value : defaultValue,

  /**
   * ok / err 各々のハンドラを呼び分けて値を返す（pattern match 風）。
   * @param r 分岐対象 Result
   * @param handlers ok / err 用のハンドラ
   * @returns ハンドラの戻り値
   */
  match: <T, E, R>(
    r: Result<T, E>,
    handlers: { readonly ok: (value: T) => R; readonly err: (error: E) => R },
  ): R => (r.ok ? handlers.ok(r.value) : handlers.err(r.error)),
} as const;
