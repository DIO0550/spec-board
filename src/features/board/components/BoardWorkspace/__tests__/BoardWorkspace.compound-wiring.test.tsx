import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskForest } from "@/domains/task-forest";
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
  /** GUIDE.mdタブ選択コールバック（省略時はタブ非表示） */
  onGuideClick?: () => void;
};

const renderWorkspace = (options: RenderOptions) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <BoardWorkspace
        projections={TaskProjection.emptyMap}
        taskTree={TaskForest.empty}
        columns={options.columns}
        tasks={options.tasks ?? []}
        onAddTask={options.onAddTask ?? (() => {})}
        onTaskClick={() => {}}
        onAddColumn={options.onAddColumn}
        onGuideClick={options.onGuideClick}
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

test("5番目のロードマップタブからEpicロードマップへ到達できる", async () => {
  renderWorkspace({
    columns: [{ name: "Todo", order: 0 }],
    tasks: [makeTask({ title: "Epic A" })],
  });
  let roadmapTab: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    roadmapTab =
      container?.querySelector<HTMLButtonElement>(
        "[role='tab'][aria-controls='board-view-panel-roadmap']",
      ) ?? null;
    expect(roadmapTab).not.toBeNull();
  });
  act(() => roadmapTab?.click());
  await vi.waitFor(() => {
    expect(container?.querySelector("[data-roadmap]")).not.toBeNull();
  });
  expect(localStorage.getItem("spec-board:viewMode")).toBe("roadmap");
});

test("GUIDE.mdタブはcallbackだけを呼びviewとstorageを変更しない", async () => {
  localStorage.setItem("spec-board:viewMode", "roadmap");
  const onGuideClick = vi.fn();
  renderWorkspace({
    columns: [{ name: "Todo", order: 0 }],
    onGuideClick,
  });
  const guideTab = container?.querySelector<HTMLButtonElement>(
    "[role='tab'][aria-controls='board-view-panel-guide']",
  );

  act(() => guideTab?.click());

  expect(onGuideClick).toHaveBeenCalledOnce();
  expect(
    container?.querySelector("[data-board-view='roadmap']"),
  ).not.toBeNull();
  expect(localStorage.getItem("spec-board:viewMode")).toBe("roadmap");
});

test("localStorageの未知view modeはboardへ正規化する", () => {
  localStorage.setItem("spec-board:viewMode", "unknown");
  renderWorkspace({ columns: [{ name: "Todo", order: 0 }] });

  expect(container?.querySelector("[data-board-view='board']")).not.toBeNull();
});

test("参照デザインのsubbarに検索と折りたたみ式フィルタ導線を表示する", async () => {
  renderWorkspace({
    columns: [{ name: "Todo", order: 0 }],
    tasks: [makeTask()],
  });

  const search = container?.querySelector(
    '[data-testid="board-filter-search"]',
  );
  const filterButton = container?.querySelector<HTMLButtonElement>(
    '[data-testid="board-filter-toggle"]',
  );
  expect(search).not.toBeNull();
  expect(filterButton?.getAttribute("aria-expanded")).toBe("false");
  expect(filterButton?.getAttribute("aria-controls")).toBeNull();
  expect(
    container?.querySelector('[data-testid="task-filter-panel"]'),
  ).toBeNull();

  act(() => filterButton?.click());

  expect(filterButton?.getAttribute("aria-expanded")).toBe("true");
  expect(filterButton?.getAttribute("aria-controls")).toBe("task-filter-panel");
  const filterPanel = container?.querySelector<HTMLElement>(
    '[data-testid="task-filter-panel"]',
  );
  expect(filterPanel).not.toBeNull();
  expect(filterPanel?.id).toBe("task-filter-panel");
  const roadmapTab = container?.querySelector<HTMLButtonElement>(
    "[role='tab'][aria-controls='board-view-panel-roadmap']",
  );
  expect(roadmapTab).not.toBeNull();
  act(() => roadmapTab?.click());
  await vi.waitFor(() => {
    expect(container?.querySelector("[data-roadmap]")).not.toBeNull();
  });
  const roadmapFilterButton = container?.querySelector<HTMLButtonElement>(
    '[data-testid="board-filter-toggle"]',
  );
  expect(roadmapFilterButton?.getAttribute("aria-expanded")).toBe("false");
  expect(roadmapFilterButton?.getAttribute("aria-controls")).toBeNull();
  expect(roadmapFilterButton?.className).not.toContain("border-accent");
  expect(
    container?.querySelector('[data-testid="task-filter-panel"]'),
  ).toBeNull();

  const boardTab = container?.querySelector<HTMLButtonElement>(
    "[role='tab'][aria-controls='board-view-panel-board']",
  );
  expect(boardTab).not.toBeNull();
  act(() => boardTab?.click());
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-board-view='board']"),
    ).not.toBeNull();
  });
  const boardFilterButton = container?.querySelector<HTMLButtonElement>(
    '[data-testid="board-filter-toggle"]',
  );
  expect(boardFilterButton?.getAttribute("aria-expanded")).toBe("false");
  expect(boardFilterButton?.getAttribute("aria-controls")).toBeNull();
  expect(
    container?.querySelector('[data-testid="task-filter-panel"]'),
  ).toBeNull();
});
