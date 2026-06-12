import { expect, test } from "vitest";
import { Task, type TaskPayload } from "../task";

const basePayload: TaskPayload = {
  id: "task-1",
  title: "Task",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/task-1.md",
  extras: {},
  warnings: [],
};

test("fromPayload は draft: true を透過する", () => {
  const task = Task.fromPayload({ ...basePayload, draft: true });
  expect(task.draft).toBe(true);
});

test("fromPayload は draft 省略時 false になる（旧 BE 互換）", () => {
  const task = Task.fromPayload(basePayload);
  expect(task.draft).toBe(false);
});
