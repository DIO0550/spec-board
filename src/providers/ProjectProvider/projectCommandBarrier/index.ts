import { awaitProjectCommands, type ProjectCommandQueue } from "../concurrency";

/** `awaitStable` の結果。 */
export type ProjectCommandBarrierResult =
  /**
   * 待機を抜けた時点で未完了の mutation が無い。`tail` は読み取り開始時点の
   * queue 末尾で、応答採否の「読み取り中に mutation が走ったか」判定に使う。
   */
  | { readonly kind: "stable"; readonly tail: Promise<unknown> }
  /** mutation が途切れず上限回数まで待ち直した。今読んでも古い版になる。 */
  | { readonly kind: "unstable" }
  /** 待機中に新しい要求へ追い越された。この要求は何もせず降りる。 */
  | { readonly kind: "abandoned" };

/** `awaitStable` の待機条件。 */
export type ProjectCommandBarrierOptions = {
  /** 待ち直す上限回数。 */
  readonly maxAttempts: number;
  /**
   * この要求がまだ最新かを返す述語。false になった時点で `abandoned` を返す。
   * @returns 追い越されていなければ true
   */
  readonly isLatest: () => boolean;
};

/** project command queue の read barrier companion API。 */
export const ProjectCommandBarrier = {
  /**
   * queue 末尾が動かなくなるまで待ち直し、「読み始める時点で未完了の mutation が
   * 無い」状態を作る。
   *
   * `awaitProjectCommands` は「呼び出した時点の tail」しか待たないため、待機中に
   * enqueue された mutation は待ってもらえない。tail が同一参照のまま返ってくる
   * まで繰り返すことで、その隙間を塞ぐ。無限に待つと再取得が永久に始まらないので
   * 上限で打ち切り、取り直しに倒す。
   * @param queue project command queue
   * @param options 上限回数と追い越し判定
   * @returns 安定 / 不安定 / 放棄のいずれか
   */
  awaitStable: async (
    queue: ProjectCommandQueue,
    options: ProjectCommandBarrierOptions,
  ): Promise<ProjectCommandBarrierResult> => {
    for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
      const tail = queue.current;
      await awaitProjectCommands(queue);
      if (!options.isLatest()) {
        return { kind: "abandoned" };
      }
      if (queue.current === tail) {
        return { kind: "stable", tail };
      }
    }
    return { kind: "unstable" };
  },
} as const;
