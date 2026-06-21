import { act, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import { Task, type TaskPayload } from "@/types/task";
import { COLUMN_DRAG_MIME_TYPE, DRAG_MIME_TYPE } from "../../Board/mime";
import {
  type BoardCardApi,
  BoardCardProvider,
  type TaskDropHandler,
  useBoardCard,
} from "../../BoardCardProvider";
import {
  BoardColumnProvider,
  type ColumnReorderHandler,
} from "../../BoardColumnProvider";
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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

type RenderOptions = {
  /** Column メタ props（order はデフォルト 0） */
  column: Omit<Parameters<typeof Column>[0], "order"> & { order?: number };
  /** BoardCardProvider に渡す表示用 tasks */
  tasks?: readonly Task[];
  /** BoardCardProvider に渡す全 tasks（未指定なら tasks を使う） */
  allTasks?: readonly Task[];
  /** BoardCardProvider に渡す tasksByNormalizedPath */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** BoardCardProvider に渡す doneColumn */
  doneColumn?: string;
  /** BoardCardProvider に渡す onTaskDrop */
  onTaskDrop?: TaskDropHandler;
  /** BoardColumnProvider に渡す onColumnReorder */
  onColumnReorder?: ColumnReorderHandler;
  /** Provider に渡す columns（未指定なら column.name 1 列） */
  columns?: readonly { name: string; order: number }[];
};

/**
 * BoardCardProvider 配下で useBoardCard を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const CardProbe = (props: { onResult: (api: BoardCardApi) => void }) => {
  const api = useBoardCard();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * BoardCardProvider / BoardColumnProvider 配下に Column を mount し、card API を観測する。
 * @param options Column / Provider に渡すオプション
 * @returns container / cardApi accessor
 */
const renderWithProviders = (options: RenderOptions) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let latestCard: BoardCardApi | null = null;
  const handleResult = (api: BoardCardApi) => {
    latestCard = api;
  };
  const tasks = options.tasks ?? [];
  const allTasks = options.allTasks ?? tasks;
  const columns = options.columns ?? [{ name: options.column.name, order: 0 }];
  const tree: ReactNode = (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={options.tasksByNormalizedPath}
      doneColumn={options.doneColumn}
      onTaskDrop={options.onTaskDrop}
    >
      <BoardColumnProvider
        columns={columns}
        tasks={tasks}
        allTasks={allTasks}
        onColumnReorder={options.onColumnReorder}
      >
        <Column order={0} {...options.column} />
        <CardProbe onResult={handleResult} />
      </BoardColumnProvider>
    </BoardCardProvider>
  );
  act(() => {
    root?.render(tree);
  });
  return {
    get cardApi(): BoardCardApi {
      return latestCard as BoardCardApi;
    },
  };
};

const querySection = (): HTMLElement => {
  const el = container?.querySelector<HTMLElement>("section");
  expect(el).not.toBeNull();
  return el as HTMLElement;
};

test("独自 MIME を持つ dragover で preventDefault される", () => {
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
});

test("他 MIME (text/plain) の dragover では preventDefault されない", () => {
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData("text/plain", "x");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(false);
});

test("dragover で hover ターゲット (name, index) が Provider に通知される", async () => {
  const probe = renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Done");
  });
  const section = querySection();
  const event = createDragEvent("dragover", { clientY: 0 });
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  await vi.waitFor(() => {
    expect(probe.cardApi.hoverTarget).toEqual({ column: "Todo", index: 0 });
  });
});

test("currentTarget 外への dragleave で hover ターゲットが (null, null) にリセットされる", () => {
  const probe = renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Done");
    probe.cardApi.hover("Todo", 0);
  });
  const section = querySection();
  const event = createDragEvent("dragleave");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(probe.cardApi.hoverTarget).toEqual({ column: null, index: null });
});

test("drop で onTaskDrop が期待引数で呼ばれる", async () => {
  const onTaskDrop = vi.fn();
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = renderWithProviders({
    column: { name: "Done", onAddClick: vi.fn() },
    allTasks: [taskA],
    onTaskDrop,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Todo");
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  await vi.waitFor(() => {
    expect(onTaskDrop).toHaveBeenCalledWith({
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    });
  });
});

test("dataTransfer 空の drop（外部 D&D）では onTaskDrop が呼ばれない", () => {
  const onTaskDrop = vi.fn();
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = renderWithProviders({
    column: { name: "Done", onAddClick: vi.fn() },
    allTasks: [taskA],
    onTaskDrop,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Todo");
  });
  const section = querySection();
  const event = createDragEvent("drop");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).not.toHaveBeenCalled();
});

test("dataTransfer の filePath が dragState と不一致なら onTaskDrop が呼ばれない", () => {
  const onTaskDrop = vi.fn();
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = renderWithProviders({
    column: { name: "Done", onAddClick: vi.fn() },
    allTasks: [taskA],
    onTaskDrop,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Todo");
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/wrong.md");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onTaskDrop).not.toHaveBeenCalled();
});

test("空カラムでの drop は toIndex=0 で呼ばれる", async () => {
  const onTaskDrop = vi.fn();
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = renderWithProviders({
    column: { name: "Done", onAddClick: vi.fn() },
    allTasks: [taskA],
    onTaskDrop,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/a.md", "Todo");
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  await vi.waitFor(() => {
    expect(onTaskDrop).toHaveBeenCalledWith({
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    });
  });
});

test("非空カラムでの drop は drop event の clientY から toIndex を同期計算する", async () => {
  const tasks = [
    makeTask({ id: "1", filePath: "tasks/1.md", status: "Done" }),
    makeTask({ id: "2", filePath: "tasks/2.md", status: "Done" }),
    makeTask({ id: "3", filePath: "tasks/3.md", status: "Done" }),
  ];
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const onTaskDrop = vi.fn();
  const probe = renderWithProviders({
    column: { name: "Done", onAddClick: vi.fn() },
    tasks,
    allTasks: [...tasks, taskA],
    onTaskDrop,
  });
  act(() => {
    // hoverIndex を故意に 0 に設定（drop 側で再計算されることを確認）
    probe.cardApi.startDrag("tasks/a.md", "Todo");
    probe.cardApi.hover("Done", 0);
  });
  const liElements =
    container?.querySelectorAll<HTMLLIElement>("li[data-task-card]") ?? [];
  expect(liElements.length).toBe(3);
  const rects = [
    { top: 0, bottom: 40 },
    { top: 40, bottom: 80 },
    { top: 80, bottom: 120 },
  ];
  liElements.forEach((el, i) => {
    const r = rects[i] as { top: number; bottom: number };
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top: r.top,
      bottom: r.bottom,
      left: 0,
      right: 100,
      width: 100,
      height: r.bottom - r.top,
      x: 0,
      y: r.top,
      toJSON: () => ({}),
    } as DOMRect);
  });
  const section = querySection();
  const event = createDragEvent("drop", { clientY: 70 });
  event.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  act(() => {
    section.dispatchEvent(event);
  });
  await vi.waitFor(() => {
    expect(onTaskDrop).toHaveBeenCalledWith({
      taskFilePath: "tasks/a.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 2,
    });
  });
});

test("hoverTarget.column === name の時のみ drop-placeholder が出る", () => {
  const tasks = [makeTask({ id: "1", filePath: "tasks/1.md" })];
  const probe = renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
    tasks,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/x.md", "Todo");
    probe.cardApi.hover("Todo", 0);
  });
  expect(
    container?.querySelector("[data-testid='drop-placeholder']"),
  ).not.toBeNull();
});

test("hoverTarget.column が他カラムの時は placeholder が出ない", () => {
  const tasks = [makeTask({ id: "1", filePath: "tasks/1.md" })];
  const probe = renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
    tasks,
  });
  act(() => {
    probe.cardApi.startDrag("tasks/x.md", "Done");
    probe.cardApi.hover("Done", 0);
  });
  expect(
    container?.querySelector("[data-testid='drop-placeholder']"),
  ).toBeNull();
});

test("column MIME の dragover で preventDefault される", () => {
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  const section = querySection();
  const event = createDragEvent("dragover");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "Done");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
});

test("column MIME の drop で onColumnReorder({fromColumnName, toColumnName})", async () => {
  const onColumnReorder = vi.fn();
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
    onColumnReorder,
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "Done");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  await vi.waitFor(() => {
    expect(onColumnReorder).toHaveBeenCalledWith({
      fromColumnName: "Done",
      toColumnName: "Todo",
    });
  });
});

test("column MIME の drop で fromColumnName が空文字列なら onColumnReorder は呼ばれないが preventDefault は実行される", () => {
  const onColumnReorder = vi.fn();
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
    onColumnReorder,
  });
  const section = querySection();
  const event = createDragEvent("drop");
  event.dataTransfer.setData(COLUMN_DRAG_MIME_TYPE, "");
  act(() => {
    section.dispatchEvent(event);
  });
  expect(onColumnReorder).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

test("columnDraggable=true を渡すと内部 ColumnHeader に draggable=true が配線される", () => {
  renderWithProviders({
    column: {
      name: "Todo",
      onAddClick: vi.fn(),
      columnDraggable: true,
    },
  });
  const header = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(header?.getAttribute("draggable")).toBe("true");
});

test("columnDraggable=false / 未指定なら ColumnHeader の draggable は false", () => {
  renderWithProviders({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  const header = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(header?.getAttribute("draggable")).toBe("false");
});
