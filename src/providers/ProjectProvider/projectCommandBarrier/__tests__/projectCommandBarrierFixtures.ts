import type { ProjectCommandQueue } from "../../concurrency";

/**
 * tail が決められた回数だけ進んだあと落ち着く queue を作る。
 *
 * barrier より先に `then` を登録することで、barrier の待機が明けた時点では
 * 既に `current` が次の tail へ差し替わっている状態を作る。
 * @param moves tail を進める回数
 * @returns 指定回数だけ tail が動く queue
 */
export const advancingQueue = (moves: number): ProjectCommandQueue => {
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  let advanced = 0;
  const advanceOnSettle = (tail: Promise<unknown>): void => {
    void tail.then(() => {
      if (advanced >= moves) {
        return;
      }
      advanced += 1;
      const next = Promise.resolve();
      queue.current = next;
      advanceOnSettle(next);
    });
  };
  advanceOnSettle(queue.current);
  return queue;
};

/**
 * 読むたびに別の tail を返す queue を作る。mutation が途切れない状況を表す。
 *
 * 自走する `then` チェーンで tail を進めると microtask が尽きず、待機側が
 * 打ち切っても進み続けてテストが終わらない。読み取りごとに新しい参照を返す
 * getter にすれば、barrier の歩幅とは独立に「常に動いている」を再現できる。
 * @returns tail が決して安定しない queue
 */
export const neverStableQueue = (): ProjectCommandQueue => ({
  get current(): Promise<unknown> {
    return Promise.resolve();
  },
});
