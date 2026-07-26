import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import type { Column as ColumnType } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { BoardWorkspace } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  // 表示形態は localStorage 経由で復元されるため、テスト間でリーク防止に毎回クリア。
  // default は "board" タブで render される。
  localStorage.clear();
});

afterEach(() => {
  unmountWorkspace();
  localStorage.clear();
});

const unmountWorkspace = () => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
};

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
  /** カラム定義 */
  columns: ColumnType[];
  /** 表示用タスク（省略時は空） */
  tasks?: Task[];
  /** 「+ 追加」クリック時のコールバック（省略時は no-op） */
  onAddTask?: (columnName: string) => void;
  /** 新規カラム追加コールバック（省略時は AddColumnButton 非表示） */
  onAddColumn?: (columnName: string) => void;
};

const renderWorkspace = (options: RenderOptions) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <BoardWorkspace
        projections={TaskProjection.emptyMap}
        columns={options.columns}
        tasks={options.tasks ?? []}
        onAddTask={options.onAddTask ?? (() => {})}
        onTaskClick={() => {}}
        onAddColumn={options.onAddColumn}
      />,
    );
  });
};

test("逆順 columns が order 順で描画される", async () => {
  const columns: ColumnType[] = [
    { name: "Done", order: 2 },
    { name: "Todo", order: 0 },
    { name: "In Progress", order: 1 },
  ];
  renderWorkspace({ columns });
  await vi.waitFor(() => {
    const labels = Array.from(
      container?.querySelectorAll("section[aria-label]") ?? [],
    ).map((s) => s.getAttribute("aria-label"));
    expect(labels).toEqual(["Todo", "In Progress", "Done"]);
  });
});

test("columnDraggable は件数境界で双方向に切り替わる（1 件で false / 2 件で true）", async () => {
  renderWorkspace({ columns: [{ name: "Todo", order: 0 }] });
  await vi.waitFor(() => {
    expect(
      container?.querySelectorAll<HTMLElement>("[data-testid='column-header']")
        .length,
    ).toBe(1);
  });
  const singleHeader = container?.querySelector<HTMLElement>(
    "[data-testid='column-header']",
  );
  expect(singleHeader?.getAttribute("draggable")).toBe("false");

  unmountWorkspace();

  renderWorkspace({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
  });
  await vi.waitFor(() => {
    const headers = container?.querySelectorAll<HTMLElement>(
      "[data-testid='column-header']",
    );
    expect(headers?.length).toBe(2);
  });
  const headers = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='column-header']") ??
      [],
  );
  for (const header of headers) {
    expect(header.getAttribute("draggable")).toBe("true");
  }
});

test("onAddColumn の有無で追加ボタンが双方向に切り替わる", async () => {
  renderWorkspace({
    columns: [{ name: "Todo", order: 0 }],
    onAddColumn: undefined,
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelectorAll("section[aria-label]").length,
    ).toBeGreaterThan(0);
  });
  expect(
    container?.querySelector("[data-testid='add-column-button']"),
  ).toBeNull();

  unmountWorkspace();

  renderWorkspace({
    columns: [{ name: "Todo", order: 0 }],
    onAddColumn: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='add-column-button']"),
    ).not.toBeNull();
  });
});

test("`+ 追加` クリックで onAddTask が該当 columnName で呼ばれる", async () => {
  const onAddTask = vi.fn();
  renderWorkspace({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
    tasks: [makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" })],
    onAddTask,
  });
  let addButton: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    const todoSection = container?.querySelector<HTMLElement>(
      "section[aria-label='Todo']",
    );
    addButton =
      (Array.from(todoSection?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent?.trim() === "+ 追加",
      ) as HTMLButtonElement | undefined) ?? null;
    expect(addButton).not.toBeNull();
  });
  act(() => {
    addButton?.click();
  });
  expect(onAddTask).toHaveBeenCalledTimes(1);
  expect(onAddTask).toHaveBeenCalledWith("Todo");
});
