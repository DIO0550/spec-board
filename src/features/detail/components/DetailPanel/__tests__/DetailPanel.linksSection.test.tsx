import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { DetailPanel } from "..";

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

const render = (props: Parameters<typeof DetailPanel>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
};

test("onAddLink と allTasks の両方が指定されているときに LinksSection が描画される", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
  });

  expect(document.querySelector('[data-testid="links-section"]')).toBeTruthy();
});

test("onAddLink が undefined だと LinksSection は描画されない", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render({
    task,
    columns: testColumns,
    allTasks: [task],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
  });

  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
});

test("allTasks が undefined だと LinksSection は描画されない", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render({
    task,
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(task)),
  });

  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
});

test("LinksSection の候補選択で onAddLink が source/target 付きで呼ばれる", async () => {
  const self = createTask({ filePath: "tasks/self.md" });
  const candidate = createTask({
    filePath: "tasks/c.md",
    title: "C",
  });
  const onAddLink = vi.fn(async () => Result.ok(self));
  render({
    task: self,
    columns: testColumns,
    allTasks: [self, candidate],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink,
  });

  act(() => {
    (
      document.querySelector(
        '[data-testid="links-section-add-button"]',
      ) as HTMLButtonElement
    ).click();
  });

  const option = document.querySelector(
    `[data-testid="links-section-option-${candidate.id}"]`,
  ) as HTMLButtonElement;
  await act(async () => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });

  expect(onAddLink).toHaveBeenCalledWith("tasks/self.md", "tasks/c.md");
});

test("DetailPanel に onSelectTask を渡すと LinksSection links 行 click で呼ばれる", async () => {
  const self = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/linked.md"],
  });
  const linked = createTask({ filePath: "tasks/linked.md", title: "Linked" });
  const onSelectTask = vi.fn();
  render({
    task: self,
    columns: testColumns,
    allTasks: [self, linked],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(self)),
    onSelectTask,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/linked.md"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  await act(async () => {
    btn.click();
  });
  expect(onSelectTask).toHaveBeenCalledTimes(1);
  expect(onSelectTask).toHaveBeenCalledWith("tasks/linked.md");
});

test("DetailPanel に onSelectTask を渡すと LinksSection reverse 行 click でも呼ばれる", async () => {
  const self = createTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/other.md"],
  });
  const other = createTask({ filePath: "tasks/other.md", title: "Other" });
  const onSelectTask = vi.fn();
  render({
    task: self,
    columns: testColumns,
    allTasks: [self, other],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(self)),
    onSelectTask,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/other.md"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  await act(async () => {
    btn.click();
  });
  expect(onSelectTask).toHaveBeenCalledTimes(1);
  expect(onSelectTask).toHaveBeenCalledWith("tasks/other.md");
});

test("DetailPanel に onSelectTask を渡さない場合、LinksSection の navigate button は disabled", () => {
  const self = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
  render({
    task: self,
    columns: testColumns,
    allTasks: [self],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink: vi.fn(async () => Result.ok(self)),
  });

  const forwardBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/a.md"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/r.md"]',
  ) as HTMLButtonElement;
  expect(forwardBtn.disabled).toBe(true);
  expect(reverseBtn.disabled).toBe(true);
});

test("DetailPanel に異なる task.id を渡すと LinksSection が再マウントされ popover が閉じる", () => {
  const taskA = createTask({ filePath: "tasks/a.md" });
  const taskB = createTask({ filePath: "tasks/b.md" });
  const onAddLink = vi.fn(async () => Result.ok(taskA));
  const baseProps = {
    columns: testColumns,
    allTasks: [taskA, taskB],
    onClose: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    onAddLink,
  };

  type SwitcherProps = { task: Task };
  let setTaskOuter: ((t: Task) => void) | null = null;
  const Switcher = (props: SwitcherProps) => {
    const [task, setTask] = useState(props.task);
    setTaskOuter = setTask;
    return createElement(DetailPanel, { ...baseProps, task });
  };

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Switcher, { task: taskA }));
  });

  act(() => {
    (
      document.querySelector(
        '[data-testid="links-section-add-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeTruthy();

  act(() => {
    setTaskOuter?.(taskB);
  });
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeNull();
});
