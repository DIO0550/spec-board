import { expect, test } from "vitest";
import { Task, type TaskPayload } from "../task";

test("fromPayload は flat payload の関連情報を nested domain property に変換する", () => {
  const payload: TaskPayload = {
    id: "task-1",
    title: "Task",
    status: "Todo",
    priority: "High",
    labels: ["bug"],
    parent: "tasks/parent.md",
    links: ["tasks/linked.md"],
    children: ["tasks/child.md"],
    reverseLinks: ["tasks/reverse.md"],
    body: "body",
    filePath: "tasks/task-1.md",
  };

  const task = Task.fromPayload(payload);

  expect(task).toEqual({
    id: "task-1",
    title: "Task",
    status: "Todo",
    priority: "High",
    labels: ["bug"],
    body: "body",
    filePath: "tasks/task-1.md",
    links: {
      linkedFilePaths: ["tasks/linked.md"],
      reverseLinkedFilePaths: ["tasks/reverse.md"],
    },
    hierarchy: {
      parentFilePath: "tasks/parent.md",
      childFilePaths: ["tasks/child.md"],
    },
  });
});
