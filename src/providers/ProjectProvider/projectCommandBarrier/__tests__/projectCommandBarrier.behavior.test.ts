import { expect, test } from "vitest";
import { ProjectCommandBarrier } from "../index";
import {
  advancingQueue,
  neverStableQueue,
} from "./projectCommandBarrierFixtures";

const LATEST = { maxAttempts: 5, isLatest: () => true } as const;

/** 待ち直し 1 回につき 1 度だけ呼ばれる `isLatest` で試行回数を数える。 */
const countingLatest = (counter: { calls: number }) => (): boolean => {
  counter.calls += 1;
  return true;
};

test("mutation が無ければ 1 回で安定する", async () => {
  const queue = { current: Promise.resolve() };

  const barrier = await ProjectCommandBarrier.awaitStable(queue, LATEST);

  expect(barrier).toEqual({ kind: "stable", tail: queue.current });
});

test("1 回動いたあと落ち着けば安定する", async () => {
  const queue = advancingQueue(1);

  const barrier = await ProjectCommandBarrier.awaitStable(queue, LATEST);

  expect(barrier).toEqual({ kind: "stable", tail: queue.current });
});

test("上限回数まで動き続ければ unstable になる", async () => {
  const counter = { calls: 0 };

  const barrier = await ProjectCommandBarrier.awaitStable(neverStableQueue(), {
    maxAttempts: 5,
    isLatest: countingLatest(counter),
  });

  expect(barrier).toEqual({ kind: "unstable" });
  expect(counter.calls).toBe(5);
});

test("maxAttempts が 1 なら 1 回だけ試す", async () => {
  const counter = { calls: 0 };

  const barrier = await ProjectCommandBarrier.awaitStable(neverStableQueue(), {
    maxAttempts: 1,
    isLatest: countingLatest(counter),
  });

  expect(barrier).toEqual({ kind: "unstable" });
  expect(counter.calls).toBe(1);
});

test("追い越されたら放棄する", async () => {
  const queue = { current: Promise.resolve() };

  const barrier = await ProjectCommandBarrier.awaitStable(queue, {
    maxAttempts: 5,
    isLatest: () => false,
  });

  expect(barrier).toEqual({ kind: "abandoned" });
});

test("tail も動いている場合は追い越し判定が先に効く", async () => {
  const barrier = await ProjectCommandBarrier.awaitStable(neverStableQueue(), {
    maxAttempts: 5,
    isLatest: () => false,
  });

  expect(barrier).toEqual({ kind: "abandoned" });
});
