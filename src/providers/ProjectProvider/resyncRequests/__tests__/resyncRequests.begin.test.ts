import { expect, test } from "vitest";
import { ResyncRequests } from "../index";
import { startedRequest } from "./resyncRequestsFixtures";

const TARGET = { path: "/home/user/specs", generation: 3 } as const;

test("発行中の要求が無ければ発行を許可する", () => {
  const begun = ResyncRequests.begin(ResyncRequests.initial, TARGET);

  expect(begun.kind).toBe("started");
  expect(begun.state.active).toEqual({ id: 1, ...TARGET });
});

test("発行した token は state の active と同一参照", () => {
  const begun = ResyncRequests.begin(ResyncRequests.initial, TARGET);

  expect(begun.state.active).toBe(startedRequest(begun));
});

test("解決済みの状態から発行すると id が単調に増える", () => {
  const released = { lastRequestId: 1, active: null, pending: false };

  const begun = ResyncRequests.begin(released, TARGET);

  expect(begun.state.active).toEqual({ id: 2, ...TARGET });
});

test("発行中の要求は畳み込む", () => {
  const first = ResyncRequests.begin(ResyncRequests.initial, TARGET);

  const second = ResyncRequests.begin(first.state, TARGET);

  expect(second.kind).toBe("merged");
  expect(second.state.pending).toBe(true);
  expect(second.state.lastRequestId).toBe(1);
});

test("畳み込みを繰り返しても採番は進まない", () => {
  const first = ResyncRequests.begin(ResyncRequests.initial, TARGET);
  const second = ResyncRequests.begin(first.state, TARGET);

  const third = ResyncRequests.begin(second.state, TARGET);

  expect(third.kind).toBe("merged");
  expect(third.state.lastRequestId).toBe(1);
});

test("path が変われば旧要求を切り離して発行する", () => {
  const first = ResyncRequests.begin(ResyncRequests.initial, TARGET);

  const switched = ResyncRequests.begin(first.state, {
    path: "/home/user/other",
    generation: TARGET.generation,
  });

  expect(switched.kind).toBe("started");
  expect(switched.state.active).toEqual({
    id: 2,
    path: "/home/user/other",
    generation: TARGET.generation,
  });
});

test("generation が変われば旧要求を切り離して発行する", () => {
  const first = ResyncRequests.begin(ResyncRequests.initial, TARGET);

  const reopened = ResyncRequests.begin(first.state, {
    path: TARGET.path,
    generation: TARGET.generation + 1,
  });

  expect(reopened.kind).toBe("started");
  expect(reopened.state.active).toEqual({
    id: 2,
    path: TARGET.path,
    generation: TARGET.generation + 1,
  });
});

test("切り離し時に立っていた pending は持ち越さない", () => {
  const first = ResyncRequests.begin(ResyncRequests.initial, TARGET);
  const merged = ResyncRequests.begin(first.state, TARGET);

  const switched = ResyncRequests.begin(merged.state, {
    path: "/home/user/other",
    generation: TARGET.generation,
  });

  expect(switched.state.pending).toBe(false);
});
