import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { BoardCardProvider } from "../../BoardCardProvider";
import { BoardColumnProvider } from "../../BoardColumnProvider";
import { Column } from "..";

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

const invalidWarning: TaskWarning = {
  code: "invalidStatusUsedDefault",
  field: "status",
  message: "invalid status, used default",
};
const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};

/**
 * テスト用に最小限の Task を構築する。
 * @param overrides 上書きしたい一部フィールド
 * @returns Task
 */
function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
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
}

type RenderOptions = {
  column: Omit<Parameters<typeof Column>[0], "order"> & { order?: number };
  tasks?: readonly Task[];
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
};

/**
 * BoardCardProvider / BoardColumnProvider 配下に Column を mount する。
 * @param options - レンダリングオプション
 */
function render(options: RenderOptions) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tasks = options.tasks ?? [];
  const allTasks = tasks;
  const columns = [{ name: options.column.name, order: 0 }];
  const tree: ReactNode = (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={options.tasksByNormalizedPath}
    >
      <BoardColumnProvider columns={columns} tasks={tasks} allTasks={allTasks}>
        <Column order={0} {...options.column} />
      </BoardColumnProvider>
    </BoardCardProvider>
  );
  act(() => {
    root?.render(tree);
  });
}

test("invalid warning を持つ task を渡すとカードに parse-error-icon が表示される", () => {
  const task = createTask({ warnings: [invalidWarning] });
  render({
    column: { name: "Todo", onAddClick: vi.fn() },
    tasks: [task],
  });
  expect(
    document.querySelector('[data-testid="parse-error-icon"]'),
  ).not.toBeNull();
});

test("除外コード（parentCycle）のみの task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [cycleWarning] });
  render({
    column: { name: "Todo", onAddClick: vi.fn() },
    tasks: [task],
  });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});

test("warnings 空の task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [] });
  render({
    column: { name: "Todo", onAddClick: vi.fn() },
    tasks: [task],
  });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});
