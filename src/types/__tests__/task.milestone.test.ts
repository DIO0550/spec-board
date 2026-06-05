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

test("fromPayload は milestone を透過する", () => {
  const task = Task.fromPayload({ ...basePayload, milestone: "v0.3" });
  expect(task.milestone).toBe("v0.3");
});

test("fromPayload は milestone 省略時 undefined になる", () => {
  const task = Task.fromPayload(basePayload);
  expect(task.milestone).toBeUndefined();
});
