import { expect, test } from "vitest";
import { Task, type TaskFromPayloadInput } from "..";

const basePayload: TaskFromPayloadInput = {
  id: "id",
  title: "title",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "/p",
};

test.each<{
  name: string;
  status: string;
  doneColumn: string | undefined;
  expected: boolean;
}>([
  {
    name: "status が doneColumn と一致すれば true",
    status: "Done",
    doneColumn: "Done",
    expected: true,
  },
  {
    name: "status が doneColumn と異なれば false",
    status: "In Progress",
    doneColumn: "Done",
    expected: false,
  },
  {
    name: "doneColumn が undefined なら常に false",
    status: "Done",
    doneColumn: undefined,
    expected: false,
  },
  {
    name: "status も doneColumn も空文字で一致（境界）",
    status: "",
    doneColumn: "",
    expected: true,
  },
])("$name", ({ status, doneColumn, expected }) => {
  const task = Task.fromPayload({ ...basePayload, status });
  expect(Task.isDone(task, doneColumn)).toBe(expected);
});
