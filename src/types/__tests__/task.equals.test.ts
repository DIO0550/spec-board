import { expect, test } from "vitest";
import { TASK_COMPARED_KEYS, Task, type TaskPayload } from "@/types/task";

const fullPayload: TaskPayload = {
  id: "tasks/a.md",
  title: "A",
  status: "Todo",
  priority: "High",
  milestone: "v0.3",
  due: "2026-08-01",
  draft: true,
  labels: ["bug"],
  parent: "tasks/parent.md",
  links: ["tasks/other.md"],
  children: ["tasks/child.md"],
  reverseLinks: ["tasks/referrer.md"],
  body: "body\n",
  filePath: "tasks/a.md",
  extras: { assignee: "alice" },
  warnings: [{ code: "parentNotFound", message: "missing" }],
};

const build = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({ ...fullPayload, ...overrides });

test("同一内容の別オブジェクトは等価と判定される", () => {
  expect(Task.equals(build(), build())).toBe(true);
});

test.each([
  ["id", { id: "tasks/z.md" }],
  ["title", { title: "Z" }],
  ["status", { status: "Doing" }],
  ["priority", { priority: "Low" as const }],
  ["milestone", { milestone: "v0.4" }],
  ["due", { due: "2026-09-01" }],
  ["draft", { draft: false }],
  ["labels", { labels: ["feature"] }],
  ["body", { body: "changed\n" }],
  ["filePath", { filePath: "tasks/z.md" }],
  ["links", { links: ["tasks/changed.md"] }],
  ["reverseLinks", { reverseLinks: ["tasks/changed.md"] }],
  ["parent", { parent: "tasks/other-parent.md" }],
  ["children", { children: ["tasks/other-child.md"] }],
])("%s が変わると等価でなくなる", (_label, overrides) => {
  expect(Task.equals(build(), build(overrides))).toBe(false);
});

test("extras だけ変わった場合も等価でなくなる", () => {
  expect(Task.equals(build(), build({ extras: { assignee: "bob" } }))).toBe(
    false,
  );
});

test("warnings だけ変わった場合も等価でなくなる", () => {
  expect(
    Task.equals(
      build(),
      build({ warnings: [{ code: "parentCycle", message: "cycle" }] }),
    ),
  ).toBe(false);
});

test("warning field省略とlegacy nullは正規化後に等価と判定される", () => {
  const canonical = Task.fromPayload({
    ...fullPayload,
    warnings: [
      {
        code: "nonStringExtraKeyIgnored",
        message: "non-string extra key was ignored",
      },
    ],
  });
  const legacy = Task.fromPayload({
    ...fullPayload,
    warnings: [
      {
        code: "nonStringExtraKeyIgnored",
        field: null,
        message: "non-string extra key was ignored",
      },
    ],
  });

  expect(Task.equals(canonical, legacy)).toBe(true);
});

test("optional をすべて埋めた Task のキー集合と比較対象キーが一致する", () => {
  const keys = Object.keys(build()).sort();

  expect(keys).toEqual([...TASK_COMPARED_KEYS].sort());
  expect(TASK_COMPARED_KEYS).toHaveLength(14);
});

test("空配列同士は別インスタンスでも等価と判定される", () => {
  const left = build({ labels: [], links: [], children: [], reverseLinks: [] });
  const right = build({
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
  });

  expect(Task.equals(left, right)).toBe(true);
});

test("body が 1 文字違えば等価でなくなる", () => {
  expect(Task.equals(build(), build({ body: "body \n" }))).toBe(false);
});

test("optional が両方 undefined でも等価と判定される", () => {
  const left = build({
    priority: undefined,
    milestone: undefined,
    due: undefined,
  });
  const right = build({
    priority: undefined,
    milestone: undefined,
    due: undefined,
  });

  expect(Task.equals(left, right)).toBe(true);
});

test("片方だけ optional が欠けていれば等価でなくなる", () => {
  expect(Task.equals(build(), build({ priority: undefined }))).toBe(false);
});
