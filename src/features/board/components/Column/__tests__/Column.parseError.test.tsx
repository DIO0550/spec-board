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

/**
 * BoardCardProvider / BoardColumnProvider 配下に Column を mount する。
 * @param props Column の props（order はデフォルト 0）
 */
function render(
  props: Omit<Parameters<typeof Column>[0], "order"> & { order?: number },
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tasks = props.tasks;
  const allTasks = props.allTasks ?? tasks;
  const columns = [{ name: props.name, order: 0 }];
  const tree: ReactNode = (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={props.tasksByNormalizedPath ?? new Map()}
      doneColumn={props.doneColumn}
    >
      <BoardColumnProvider columns={columns} tasks={tasks} allTasks={allTasks}>
        <Column order={0} {...props} />
      </BoardColumnProvider>
    </BoardCardProvider>
  );
  act(() => {
    root?.render(tree);
  });
}

test("invalid warning を持つ task を渡すとカードに parse-error-icon が表示される", () => {
  const task = createTask({ warnings: [invalidWarning] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(
    document.querySelector('[data-testid="parse-error-icon"]'),
  ).not.toBeNull();
});

test("除外コード（parentCycle）のみの task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [cycleWarning] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});

test("warnings 空の task では parse-error-icon は描画されない", () => {
  const task = createTask({ warnings: [] });
  render({ name: "Todo", tasks: [task], onAddClick: vi.fn() });
  expect(document.querySelector('[data-testid="parse-error-icon"]')).toBeNull();
});
