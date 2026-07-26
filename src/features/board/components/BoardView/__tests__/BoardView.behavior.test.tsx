import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import type { Column as ColumnType } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { BoardView } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  mountContainer();
});

afterEach(() => {
  unmountView();
});

const mountContainer = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
};

const unmountView = () => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
};

const makeColumn = (name: string, order: number): ColumnType => ({
  name,
  order,
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

/** BoardView の必須 props をデフォルト補完しつつ render するヘルパー。 */
type RenderOptions = {
  columns: ColumnType[];
  filtered?: Task[];
  allTasks?: Task[];
  filterActive?: boolean;
  onAddTask?: (columnName: string) => void;
  onTaskClick?: (taskId: string) => void;
  onAddColumn?: (columnName: string) => void;
  onRenameColumn?: (oldName: string, newName: string) => void;
  onDeleteColumn?: (columnName: string, destColumn: string | undefined) => void;
};

const renderBoardView = (options: RenderOptions) => {
  act(() => {
    root?.render(
      <BoardView
        projections={TaskProjection.emptyMap}
        columns={options.columns}
        filtered={options.filtered ?? []}
        allTasks={options.allTasks ?? options.filtered ?? []}
        filterActive={options.filterActive ?? false}
        onAddTask={options.onAddTask ?? (() => {})}
        onTaskClick={options.onTaskClick ?? (() => {})}
        onAddColumn={options.onAddColumn}
        onRenameColumn={options.onRenameColumn}
        onDeleteColumn={options.onDeleteColumn}
      />,
    );
  });
};

const columnLabels = (): (string | null)[] =>
  Array.from(container?.querySelectorAll("section[aria-label]") ?? []).map(
    (s) => s.getAttribute("aria-label"),
  );

const columnHeaders = (): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='column-header']") ??
      [],
  );

test("逆順 columns が order 昇順で描画される", async () => {
  renderBoardView({
    columns: [
      makeColumn("Done", 2),
      makeColumn("Todo", 0),
      makeColumn("In Progress", 1),
    ],
  });
  await vi.waitFor(() => {
    expect(columnLabels()).toEqual(["Todo", "In Progress", "Done"]);
  });
});

test("`+ 追加` クリックで onAddTask が該当 columnName で呼ばれる", async () => {
  const onAddTask = vi.fn();
  renderBoardView({
    columns: [makeColumn("Todo", 0), makeColumn("Done", 1)],
    onAddTask,
  });
  let addButton: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    addButton =
      container?.querySelector<HTMLButtonElement>(
        "button[aria-label='Todoに追加']",
      ) ?? null;
    expect(addButton).not.toBeNull();
  });
  act(() => {
    addButton?.click();
  });
  expect(onAddTask).toHaveBeenCalledTimes(1);
  expect(onAddTask).toHaveBeenCalledWith("Todo");
});

test("カードクリックで onTaskClick が該当 task.id で呼ばれる", async () => {
  const onTaskClick = vi.fn();
  renderBoardView({
    columns: [makeColumn("Todo", 0)],
    filtered: [makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" })],
    onTaskClick,
  });
  let card: HTMLElement | null = null;
  await vi.waitFor(() => {
    card =
      container?.querySelector<HTMLElement>("[data-testid='task-card']") ??
      null;
    expect(card).not.toBeNull();
  });
  act(() => {
    card?.click();
  });
  expect(onTaskClick).toHaveBeenCalledTimes(1);
  expect(onTaskClick).toHaveBeenCalledWith("a");
});

test("columns 1 件のとき columnDraggable=false（draggable='false'）", async () => {
  renderBoardView({ columns: [makeColumn("Todo", 0)] });
  await vi.waitFor(() => {
    expect(columnHeaders().length).toBe(1);
  });
  expect(columnHeaders()[0]?.getAttribute("draggable")).toBe("false");
});

test("columns 2 件以上のとき columnDraggable=true（全て draggable='true'）", async () => {
  renderBoardView({
    columns: [makeColumn("Todo", 0), makeColumn("Done", 1)],
  });
  await vi.waitFor(() => {
    expect(columnHeaders().length).toBe(2);
  });
  for (const header of columnHeaders()) {
    expect(header.getAttribute("draggable")).toBe("true");
  }
});

test("columns 0 件のとき Column を描画せず AddColumn だけ出す", async () => {
  renderBoardView({ columns: [], onAddColumn: vi.fn() });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='add-column-button']"),
    ).not.toBeNull();
  });
  expect(columnLabels()).toEqual([]);
});

test("onAddColumn の有無で追加ボタンが双方向に切り替わる", async () => {
  renderBoardView({
    columns: [makeColumn("Todo", 0)],
    onAddColumn: undefined,
  });
  await vi.waitFor(() => {
    expect(columnLabels().length).toBeGreaterThan(0);
  });
  expect(
    container?.querySelector("[data-testid='add-column-button']"),
  ).toBeNull();

  unmountView();
  mountContainer();

  renderBoardView({
    columns: [makeColumn("Todo", 0)],
    onAddColumn: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='add-column-button']"),
    ).not.toBeNull();
  });
});

test("onRenameColumn / onDeleteColumn 指定時に rename / delete UI が表示される", async () => {
  renderBoardView({
    columns: [makeColumn("Todo", 0)],
    onRenameColumn: vi.fn(),
    onDeleteColumn: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='column-name-button']"),
    ).not.toBeNull();
  });
  expect(
    container?.querySelector("[data-testid='column-menu-button']"),
  ).not.toBeNull();
});

test("onRenameColumn / onDeleteColumn undefined 時に rename / delete UI が出ない", async () => {
  renderBoardView({
    columns: [makeColumn("Todo", 0)],
    onRenameColumn: undefined,
    onDeleteColumn: undefined,
  });
  await vi.waitFor(() => {
    expect(columnHeaders().length).toBe(1);
  });
  expect(
    container?.querySelector("[data-testid='column-name-button']"),
  ).toBeNull();
  expect(
    container?.querySelector("[data-testid='column-menu-button']"),
  ).toBeNull();
});

test("filterActive=true のとき columns 2 件でも DnD 無効（draggable='false'）が伝播する", async () => {
  renderBoardView({
    columns: [makeColumn("Todo", 0), makeColumn("Done", 1)],
    filterActive: true,
  });
  await vi.waitFor(() => {
    expect(columnHeaders().length).toBe(2);
  });
  for (const header of columnHeaders()) {
    expect(header.getAttribute("draggable")).toBe("false");
  }
});
