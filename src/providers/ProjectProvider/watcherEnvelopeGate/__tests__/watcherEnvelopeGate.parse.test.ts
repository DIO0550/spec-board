import { expect, test } from "vitest";
import { parseWatcherEnvelope } from "../index";

const outer = {
  projectKey: "/home/user/specs",
  generation: 3,
  revision: 42,
  cacheMutating: true,
  eventSeq: 17,
  changeId: "3-17",
};

const taskPayload = {
  id: "tasks/a.md",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
  extras: {},
  warnings: [],
};

test.each([
  ["task-created", { task: taskPayload }, "task-created"],
  ["task-updated", { task: taskPayload }, "task-updated"],
  ["task-deleted", { filePath: "tasks/a.md" }, "task-deleted"],
  ["watcher-resync-required", { reason: "rescan" }, "resync-required"],
  [
    "watcher-diagnostic",
    { code: "resourceExhausted", message: "boom", paths: [] },
    "diagnostic",
  ],
])("%s は payload.kind %s としてパースできる", (eventName, payload, kind) => {
  const envelope = parseWatcherEnvelope(eventName, { ...outer, payload });

  expect(envelope?.payload.kind).toBe(kind);
});

test("外枠のフィールドがそのまま取り出せる", () => {
  const envelope = parseWatcherEnvelope("task-deleted", {
    ...outer,
    payload: { filePath: "tasks/a.md" },
  });

  expect(envelope).toMatchObject({
    projectKey: "/home/user/specs",
    generation: 3,
    revision: 42,
    cacheMutating: true,
    eventSeq: 17,
    changeId: "3-17",
  });
});

test.each([
  ["eventSeq 欠損", { ...outer, eventSeq: undefined }],
  ["cacheMutating 欠損", { ...outer, cacheMutating: undefined }],
  ["revision が文字列", { ...outer, revision: "42" }],
  ["generation が文字列", { ...outer, generation: "3" }],
  ["projectKey が数値", { ...outer, projectKey: 3 }],
  ["changeId 欠損", { ...outer, changeId: undefined }],
])("%s は null になる", (_label, broken) => {
  expect(
    parseWatcherEnvelope("task-deleted", {
      ...broken,
      payload: { filePath: "tasks/a.md" },
    }),
  ).toBeNull();
});

test("task-deleted の filePath 欠損は null になる", () => {
  expect(
    parseWatcherEnvelope("task-deleted", { ...outer, payload: {} }),
  ).toBeNull();
});

test("未知の event 名は null になる", () => {
  expect(
    parseWatcherEnvelope("watcher-something-new", {
      ...outer,
      payload: { filePath: "tasks/a.md" },
    }),
  ).toBeNull();
});

test("payload.task の id/filePath 以外のフィールドが欠けていても素通しする", () => {
  const envelope = parseWatcherEnvelope("task-created", {
    ...outer,
    payload: { task: { id: "tasks/a.md", filePath: "tasks/a.md" } },
  });

  expect(envelope?.payload.kind).toBe("task-created");
});

test.each([
  ["task-created", "id", "欠損", { ...taskPayload, id: undefined }],
  ["task-created", "id", "非string", { ...taskPayload, id: 42 }],
  ["task-created", "filePath", "欠損", { ...taskPayload, filePath: undefined }],
  ["task-created", "filePath", "非string", { ...taskPayload, filePath: 42 }],
  ["task-updated", "id", "欠損", { ...taskPayload, id: undefined }],
  ["task-updated", "id", "非string", { ...taskPayload, id: 42 }],
  ["task-updated", "filePath", "欠損", { ...taskPayload, filePath: undefined }],
  ["task-updated", "filePath", "非string", { ...taskPayload, filePath: 42 }],
])("%s の task.%s が%sなら null になる", (eventName, _field, _case, task) => {
  expect(
    parseWatcherEnvelope(eventName, {
      ...outer,
      payload: { task },
    }),
  ).toBeNull();
});

test.each([
  ["null", null],
  ["undefined", undefined],
  ["数値", 42],
  ["文字列", "envelope"],
  ["配列", []],
  ["payload なし", { ...outer }],
  ["payload がプリミティブ", { ...outer, payload: 1 }],
])("%s でも例外を投げず null を返す", (_label, raw) => {
  expect(() => parseWatcherEnvelope("task-deleted", raw)).not.toThrow();
  expect(parseWatcherEnvelope("task-deleted", raw)).toBeNull();
});

test("未知の diagnostic code は unknown にフォールバックする", () => {
  const envelope = parseWatcherEnvelope("watcher-diagnostic", {
    ...outer,
    cacheMutating: false,
    payload: { code: "brandNew", message: "boom", paths: [] },
  });

  expect(envelope?.payload).toMatchObject({
    kind: "diagnostic",
    code: "unknown",
  });
});

test("diagnostic の paths が欠けていても空配列として扱う", () => {
  const envelope = parseWatcherEnvelope("watcher-diagnostic", {
    ...outer,
    cacheMutating: false,
    payload: { code: "io", message: "boom" },
  });

  expect(envelope?.payload).toMatchObject({ kind: "diagnostic", paths: [] });
});

test("resync-required の reason が未知値なら null になる", () => {
  expect(
    parseWatcherEnvelope("watcher-resync-required", {
      ...outer,
      payload: { reason: "compaction" },
    }),
  ).toBeNull();
});
