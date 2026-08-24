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
    extras: { estimate: 3 },
    warnings: [
      {
        code: "parentNotFound",
        field: "parent",
        message: "parent task was not found",
      },
    ],
  };

  const task = Task.fromPayload(payload);

  expect(task).toEqual({
    id: "task-1",
    title: "Task",
    status: "Todo",
    priority: "High",
    draft: false,
    labels: ["bug"],
    body: "body",
    filePath: "tasks/task-1.md",
    extras: { estimate: 3 },
    warnings: [
      {
        code: "parentNotFound",
        field: "parent",
        message: "parent task was not found",
      },
    ],
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

test.each([
  { due: "2026-06-30", label: "妥当な日付" },
  { due: "2026/6/30", label: "不正フォーマットも素通し" },
])("fromPayload は due $label をそのまま伝播する", ({ due }) => {
  const task = Task.fromPayload({ ...basePayload, due });
  expect(task.due).toBe(due);
});

test("fromPayload は due 未設定を undefined にする", () => {
  const task = Task.fromPayload(basePayload);
  expect(task.due).toBeUndefined();
});

test.each([
  {
    label: "field省略",
    warning: {
      code: "nonStringExtraKeyIgnored" as const,
      message: "non-string extra key was ignored",
    },
    expected: {
      code: "nonStringExtraKeyIgnored",
      message: "non-string extra key was ignored",
    },
  },
  {
    label: "legacy null",
    warning: {
      code: "nonStringExtraKeyIgnored" as const,
      field: null,
      message: "non-string extra key was ignored",
    },
    expected: {
      code: "nonStringExtraKeyIgnored",
      message: "non-string extra key was ignored",
    },
  },
  {
    label: "field文字列",
    warning: {
      code: "parentNotFound" as const,
      field: "parent",
      message: "parent task was not found",
    },
    expected: {
      code: "parentNotFound",
      field: "parent",
      message: "parent task was not found",
    },
  },
  {
    label: "field空文字",
    warning: {
      code: "invalidParentIgnored" as const,
      field: "",
      message: "parent was ignored",
    },
    expected: {
      code: "invalidParentIgnored",
      field: "",
      message: "parent was ignored",
    },
  },
])(
  "fromPayload はwarningの$labelをcanonical domainへ正規化する",
  ({ warning, expected }) => {
    const task = Task.fromPayload({ ...basePayload, warnings: [warning] });

    expect(task.warnings).toEqual([expected]);
  },
);
