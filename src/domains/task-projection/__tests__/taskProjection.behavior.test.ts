import { expect, test } from "vitest";
import type { TaskProjectionPayloadInput } from "@/domains/task-projection";
import { TaskProjection } from "@/domains/task-projection";

const payloadOf = (
  overrides: Partial<TaskProjectionPayloadInput> = {},
): TaskProjectionPayloadInput => ({
  subIssueProgress: { done: 1, total: 2 },
  isDone: false,
  childFilePaths: ["tasks/b.md"],
  ...overrides,
});

test("fromPayload は filePath をキーにした Map を返す", () => {
  const map = TaskProjection.fromPayload({ "tasks/a.md": payloadOf() });

  expect(map.get("tasks/a.md")?.subIssueProgress).toEqual({
    done: 1,
    total: 2,
  });
});

test("fromPayload は __proto__ キーでもプロトタイプ汚染を起こさない", () => {
  const map = TaskProjection.fromPayload(
    JSON.parse(
      '{"__proto__":{"subIssueProgress":{"done":1,"total":2},"isDone":true,"childFilePaths":[]}}',
    ) as Record<string, TaskProjectionPayloadInput>,
  );

  expect(map.get("__proto__")?.isDone).toBe(true);
  expect(({} as { isDone?: boolean }).isDone).toBeUndefined();
});

test("fromPayload は空オブジェクトに対して空 Map を返す", () => {
  expect(TaskProjection.fromPayload({}).size).toBe(0);
});

test("findByFilePath は登録済み filePath の projection を返す", () => {
  const map = TaskProjection.fromPayload({ "tasks/a.md": payloadOf() });

  expect(
    TaskProjection.findByFilePath(map, "tasks/a.md").childFilePaths,
  ).toEqual(["tasks/b.md"]);
});

test("findByFilePath は同一 filePath に対して同一参照を返す", () => {
  const map = TaskProjection.fromPayload({ "tasks/a.md": payloadOf() });

  expect(TaskProjection.findByFilePath(map, "tasks/a.md")).toBe(
    TaskProjection.findByFilePath(map, "tasks/a.md"),
  );
});

test("findByFilePath は未登録 path に対して常に同一の empty 参照を返す", () => {
  const map = TaskProjection.fromPayload({});

  const first = TaskProjection.findByFilePath(map, "tasks/missing.md");
  const second = TaskProjection.findByFilePath(map, "tasks/other.md");

  expect(first).toBe(second);
  expect(first).toBe(TaskProjection.empty);
});

test("findByFilePath は raw filePath をそのまま引き当て、表記揺れを正規化しない", () => {
  const map = TaskProjection.fromPayload({ "tasks/a.md": payloadOf() });

  expect(TaskProjection.findByFilePath(map, "./tasks/a.md")).toBe(
    TaskProjection.empty,
  );
});

test("equals は done/total/isDone/childFilePaths すべて一致で true を返す", () => {
  const left = TaskProjection.fromPayload({ "a.md": payloadOf() }).get("a.md");
  const right = TaskProjection.fromPayload({ "a.md": payloadOf() }).get("a.md");

  expect(TaskProjection.equals(left, right)).toBe(true);
});

test.each([
  ["done", { subIssueProgress: { done: 2, total: 2 } }],
  ["total", { subIssueProgress: { done: 1, total: 3 } }],
  ["isDone", { isDone: true }],
  ["childFilePaths の要素", { childFilePaths: ["tasks/c.md"] }],
  ["childFilePaths の件数", { childFilePaths: ["tasks/b.md", "tasks/c.md"] }],
] satisfies readonly [
  string,
  Partial<TaskProjectionPayloadInput>,
][])("equals は %s が異なれば false を返す", (_label, overrides) => {
  const left = TaskProjection.fromPayload({ "a.md": payloadOf() }).get("a.md");
  const right = TaskProjection.fromPayload({
    "a.md": payloadOf(overrides),
  }).get("a.md");

  expect(TaskProjection.equals(left, right)).toBe(false);
});

test("percentage は Math.round で丸める", () => {
  expect(TaskProjection.percentage({ done: 1, total: 3 })).toBe(33);
});

test("percentage は総数 0 のとき 0 を返す", () => {
  expect(TaskProjection.percentage({ done: 0, total: 0 })).toBe(0);
});

test("percentage は全件完了で 100 を返す", () => {
  expect(TaskProjection.percentage({ done: 4, total: 4 })).toBe(100);
});
