import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
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

/**
 * テスト用に最小限の Task を構築する。
 * @param overrides 上書きしたい一部フィールド
 * @returns Task
 */
function createTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
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
  /** Column のメタ props（name / color / order / callbacks） */
  column: Omit<Parameters<typeof Column>[0], "order"> & { order?: number };
  /** Provider に渡す表示用 tasks（指定なしなら []） */
  tasks?: readonly Task[];
  /** Provider に渡す全 tasks（指定なしなら tasks を使う） */
  allTasks?: readonly Task[];
  /** Provider に渡す doneColumn */
  doneColumn?: string;
  /** Provider に渡す tasksByNormalizedPath */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
};

/**
 * BoardCardProvider / BoardColumnProvider 配下に Column を mount する。
 * tasks や allTasks 等の lookup data は Provider 側に渡し、Column 自身には
 * メタ props だけ渡す（commit 5 で Column の lookup props が削除されたため）。
 *
 * @param options - レンダリングオプション
 */
function render(options: RenderOptions) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tasks = options.tasks ?? [];
  const allTasks = options.allTasks ?? tasks;
  const columns = [{ name: options.column.name, order: 0 }];
  const tree: ReactNode = (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={options.tasksByNormalizedPath}
      doneColumn={options.doneColumn}
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

test("カラム名がヘッダーに表示される", async () => {
  render({ column: { name: "In Progress", onAddTask: vi.fn() } });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("In Progress");
  });
});

test("タスク件数がヘッダーに表示される", async () => {
  const tasks = [
    createTask({ id: "task-1", title: "タスク1" }),
    createTask({ id: "task-2", title: "タスク2" }),
  ];
  render({ column: { name: "Todo", onAddTask: vi.fn() }, tasks });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("2");
  });
});

test("タスクのタイトルが表示される", async () => {
  const tasks = [createTask({ title: "ログイン修正" })];
  render({ column: { name: "Todo", onAddTask: vi.fn() }, tasks });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ログイン修正");
  });
});

test("「+ 追加」ボタンが表示される", async () => {
  render({ column: { name: "Todo", onAddTask: vi.fn() } });
  await vi.waitFor(() => {
    const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "+ 追加",
    );
    expect(btn).toBeDefined();
  });
});

test("aria-label にカラム名が設定される", async () => {
  render({ column: { name: "Done", onAddTask: vi.fn() } });
  await vi.waitFor(() => {
    const section = container?.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe("Done");
  });
});

test("3 階層 fixture（root + 子 1 + 孫 2 のうち done 1）で TaskCard サマリが 1/3 になる", async () => {
  const grand1 = createTask({
    id: "g1",
    title: "孫1",
    status: "Done",
    filePath: "tasks/g1.md",
  });
  const grand2 = createTask({
    id: "g2",
    title: "孫2",
    status: "Todo",
    filePath: "tasks/g2.md",
  });
  const child = createTask({
    id: "c1",
    title: "子1",
    status: "Todo",
    filePath: "tasks/c1.md",
    children: ["tasks/g1.md", "tasks/g2.md"],
  });
  const rootTask = createTask({
    id: "root",
    title: "親",
    status: "Todo",
    filePath: "tasks/root.md",
    children: ["tasks/c1.md"],
  });
  const allTasks = [rootTask, child, grand1, grand2];

  render({
    column: { name: "Todo", onAddTask: vi.fn() },
    tasks: [rootTask],
    allTasks,
    doneColumn: "Done",
  });

  await vi.waitFor(() => {
    const bar = container?.querySelector(
      "[role='progressbar']",
    ) as HTMLElement | null;
    expect(bar?.getAttribute("aria-valuenow")).toBe("33");
    expect(container?.textContent).toContain("1/3");
  });
});
