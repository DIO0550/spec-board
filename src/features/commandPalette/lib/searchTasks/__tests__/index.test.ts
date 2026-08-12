import { expect, test } from "vitest";
import { Task } from "@/types/task";
import { searchTasks } from "..";

const tasks = [
  Task.fromPayload({
    id: "SB-42",
    title: "Keyboard shortcuts",
    status: "Todo",
    labels: ["accessibility", "frontend"],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/input/keyboard.md",
  }),
];

test.each([
  "keyboard",
  "sb-42",
  "input/keyboard",
  "ACCESSIBILITY",
])("title/id/path/labelsを大文字小文字を区別せず検索できる: %s", (query) => {
  expect(searchTasks(tasks, query)).toEqual(tasks);
});

test("空白queryは全taskを返し一致しないqueryは空になる", () => {
  expect(searchTasks(tasks, "   ")).toEqual(tasks);
  expect(searchTasks(tasks, "milestone")).toEqual([]);
});
