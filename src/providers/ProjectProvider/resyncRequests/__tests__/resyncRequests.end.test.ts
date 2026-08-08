import { expect, test } from "vitest";
import {
  type ResyncRequest,
  ResyncRequests,
  type ResyncRequestsState,
} from "../index";
import { startedRequest } from "./resyncRequestsFixtures";

const PATH = "/home/user/specs";
const GENERATION = 3;

const RESOLVED = {
  supersededByMutation: false,
  resyncRequired: false,
} as const;

const REQUEST: ResyncRequest = { id: 1, path: PATH, generation: GENERATION };

/** REQUEST を発行中の状態。`active` は REQUEST と同一参照。 */
const ISSUED: ResyncRequestsState = {
  lastRequestId: 1,
  active: REQUEST,
  pending: false,
};

test("自分が active なら解放して wasActive を返す", () => {
  const ended = ResyncRequests.end(ISSUED, REQUEST, RESOLVED);

  expect(ended.wasActive).toBe(true);
  expect(ended.state.active).toBeNull();
  expect(ended.shouldRetry).toBe(false);
});

test("begin が返した token をそのまま渡せば解放できる", () => {
  const begun = ResyncRequests.begin(ResyncRequests.initial, {
    path: PATH,
    generation: GENERATION,
  });

  const ended = ResyncRequests.end(
    begun.state,
    startedRequest(begun),
    RESOLVED,
  );

  expect(ended.wasActive).toBe(true);
  expect(ended.state.active).toBeNull();
});

test("畳み込みがあった要求は解決時に再発行を求める", () => {
  const merged: ResyncRequestsState = { ...ISSUED, pending: true };

  const ended = ResyncRequests.end(merged, REQUEST, RESOLVED);

  expect(ended.shouldRetry).toBe(true);
  expect(ended.state.pending).toBe(false);
});

test.each([
  ["読み取り中に mutation が commit した", { supersededByMutation: true }],
  ["gate がもう 1 本必要と判定した", { resyncRequired: true }],
])("%s ときは再発行を求める", (_name, outcome) => {
  const ended = ResyncRequests.end(ISSUED, REQUEST, {
    ...RESOLVED,
    ...outcome,
  });

  expect(ended.shouldRetry).toBe(true);
});

test("再発行の要因が重なっても shouldRetry は 1 本ぶん", () => {
  const merged: ResyncRequestsState = { ...ISSUED, pending: true };

  const ended = ResyncRequests.end(merged, REQUEST, {
    supersededByMutation: true,
    resyncRequired: true,
  });

  expect(ended.shouldRetry).toBe(true);
});

test("切り離された旧要求の end は何もしない", () => {
  const switched = ResyncRequests.begin(ISSUED, {
    path: "/home/user/other",
    generation: GENERATION,
  });

  const ended = ResyncRequests.end(switched.state, REQUEST, RESOLVED);

  expect(ended.wasActive).toBe(false);
  expect(ended.shouldRetry).toBe(false);
  expect(ended.state).toBe(switched.state);
});

test("isLatest は追い越しを検出する", () => {
  const next = ResyncRequests.begin(
    { lastRequestId: 1, active: null, pending: false },
    { path: PATH, generation: GENERATION },
  );

  expect(ResyncRequests.isLatest(next.state, REQUEST)).toBe(false);
  expect(ResyncRequests.isLatest(ISSUED, REQUEST)).toBe(true);
});
