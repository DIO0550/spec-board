import { expect, test } from "vitest";
import {
  MilestoneProjection,
  type MilestoneProjectionPayloadInput,
  type MilestoneProjectionsPayloadInput,
} from "@/domains/milestone-projection";

const payloadOf = (
  overrides: Partial<MilestoneProjectionPayloadInput> = {},
): MilestoneProjectionPayloadInput => ({
  done: 1,
  total: 2,
  taskFilePaths: ["tasks/a.md", "tasks/b.md"],
  ...overrides,
});

test("fromPayload は milestone 名をキーにした Map を返す", () => {
  const map = MilestoneProjection.fromPayload({ v1: payloadOf() });

  expect(map.get("v1")).toEqual({
    done: 1,
    total: 2,
    taskFilePaths: ["tasks/a.md", "tasks/b.md"],
  });
});

test("fromPayload は空オブジェクトに対して空 Map を返す", () => {
  expect(MilestoneProjection.fromPayload({}).size).toBe(0);
});

test("fromPayload は入力の taskFilePaths 配列から分離したコピーを保持する", () => {
  const taskFilePaths = ["tasks/a.md"];
  const map = MilestoneProjection.fromPayload({
    v1: payloadOf({ taskFilePaths }),
  });

  taskFilePaths.push("tasks/after.md");

  expect(map.get("v1")?.taskFilePaths).toEqual(["tasks/a.md"]);
});

test("fromPayload は JavaScript の特殊名を独立した own key として保持する", () => {
  const payload = JSON.parse(
    `{
      "__proto__":{"done":1,"total":1,"taskFilePaths":["tasks/proto.md"]},
      "constructor":{"done":0,"total":1,"taskFilePaths":["tasks/constructor.md"]},
      "toString":{"done":0,"total":1,"taskFilePaths":["tasks/to-string.md"]}
    }`,
  ) as MilestoneProjectionsPayloadInput;

  const map = MilestoneProjection.fromPayload(payload);

  expect(map.get("__proto__")?.taskFilePaths).toEqual(["tasks/proto.md"]);
  expect(map.get("constructor")?.taskFilePaths).toEqual([
    "tasks/constructor.md",
  ]);
  expect(map.get("toString")?.taskFilePaths).toEqual(["tasks/to-string.md"]);
  expect(map.size).toBe(3);
});

test("findByName は登録済み milestone の projection を返す", () => {
  const map = MilestoneProjection.fromPayload({ v1: payloadOf() });

  expect(MilestoneProjection.findByName(map, "v1")).toBe(map.get("v1"));
});

test("findByName は未登録名に対して共有 zero projection を返す", () => {
  const map = MilestoneProjection.fromPayload({});

  const first = MilestoneProjection.findByName(map, "missing-1");
  const second = MilestoneProjection.findByName(map, "missing-2");

  expect(first).toBe(second);
  expect(first).toBe(MilestoneProjection.empty());
  expect(first).toEqual({ done: 0, total: 0, taskFilePaths: [] });
});

test("emptyMap は未取得状態で共有できる固定 Map を返す", () => {
  expect(MilestoneProjection.emptyMap).toBe(MilestoneProjection.emptyMap);
  expect(MilestoneProjection.emptyMap.size).toBe(0);
});

test("equals は done・total・taskFilePaths の順序まで一致すれば true を返す", () => {
  const left = MilestoneProjection.findByName(
    MilestoneProjection.fromPayload({ v1: payloadOf() }),
    "v1",
  );
  const right = MilestoneProjection.findByName(
    MilestoneProjection.fromPayload({ v1: payloadOf() }),
    "v1",
  );

  expect(MilestoneProjection.equals(left, right)).toBe(true);
});

test.each([
  ["done", { done: 0 }],
  ["total", { total: 3 }],
  ["taskFilePaths の要素", { taskFilePaths: ["tasks/b.md", "tasks/a.md"] }],
  ["taskFilePaths の件数", { taskFilePaths: ["tasks/a.md"] }],
] satisfies readonly [
  string,
  Partial<MilestoneProjectionPayloadInput>,
][])("equals は %s が異なれば false を返す", (_label, overrides) => {
  const left = MilestoneProjection.findByName(
    MilestoneProjection.fromPayload({ v1: payloadOf() }),
    "v1",
  );
  const right = MilestoneProjection.findByName(
    MilestoneProjection.fromPayload({ v1: payloadOf(overrides) }),
    "v1",
  );

  expect(MilestoneProjection.equals(left, right)).toBe(false);
});

test("sum は全 milestone の done と total を1回ずつ加算する", () => {
  const map = MilestoneProjection.fromPayload({
    v1: payloadOf({ done: 1, total: 2 }),
    v2: payloadOf({ done: 3, total: 4 }),
  });

  expect(MilestoneProjection.sum(map)).toEqual({ done: 4, total: 6 });
});
