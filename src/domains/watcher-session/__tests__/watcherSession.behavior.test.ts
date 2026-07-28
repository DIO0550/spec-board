import { expect, test } from "vitest";
import {
  type WatcherProjectKey,
  WatcherSession,
  type WatcherSessionPayloadInput,
} from "@/domains/watcher-session";

const payload = (
  overrides: Partial<WatcherSessionPayloadInput> = {},
): WatcherSessionPayloadInput => ({
  projectKey: "/home/user/specs",
  generation: 3,
  revision: 42,
  eventSeq: 17,
  ...overrides,
});

test("fromPayload は BE の 4 フィールドをそのまま透過する", () => {
  const session = WatcherSession.fromPayload(payload());

  expect(session).toEqual({
    projectKey: "/home/user/specs",
    generation: 3,
    revision: 42,
    eventSeq: 17,
  });
});

test("fromPayload は 0 を欠落させない", () => {
  const session = WatcherSession.fromPayload(
    payload({ generation: 0, revision: 0, eventSeq: 0 }),
  );

  expect(session.generation).toBe(0);
  expect(session.revision).toBe(0);
  expect(session.eventSeq).toBe(0);
});

test("isSameSession は revision / eventSeq の差を無視する", () => {
  const left = WatcherSession.fromPayload(payload());
  const right = WatcherSession.fromPayload(
    payload({ revision: 99, eventSeq: 100 }),
  );

  expect(WatcherSession.isSameSession(left, right)).toBe(true);
});

test.each([
  ["projectKey が違う", { projectKey: "/home/user/other" }],
  ["generation が違う", { generation: 4 }],
])("isSameSession は %s と判定できない", (_label, overrides) => {
  const left = WatcherSession.fromPayload(payload());
  const right = WatcherSession.fromPayload(payload(overrides));

  expect(WatcherSession.isSameSession(left, right)).toBe(false);
});

test("projectKey は brand 付きで取り出せる", () => {
  const session = WatcherSession.fromPayload(payload());

  const key: WatcherProjectKey = session.projectKey;

  expect(key).toBe("/home/user/specs");
});
