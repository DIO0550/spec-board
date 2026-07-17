import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import type { BoardWorkspaceProps } from "@/features/board/components/BoardWorkspace";
import type { BoardViewMode } from "@/features/board/hooks/useBoardViewMode";
import type { Column as ColumnType } from "@/types/column";
import { ActiveBoardView } from "..";

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

const makeTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
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

/** BoardWorkspaceProps の必須項目を補完しつつ上書きを許すヘルパー。 */
const makeWorkspace = (
  overrides: Partial<BoardWorkspaceProps> = {},
): BoardWorkspaceProps => ({
  columns: [{ name: "Todo", order: 0 }],
  tasks: [],
  onAddTask: () => {},
  onTaskClick: () => {},
  ...overrides,
});

const renderActiveBoardView = (props: {
  viewMode: BoardViewMode;
  filtered: Task[];
  filterActive?: boolean;
  workspace: BoardWorkspaceProps;
}) => {
  act(() => {
    root?.render(
      <ActiveBoardView
        viewMode={props.viewMode}
        filtered={props.filtered}
        filterActive={props.filterActive ?? false}
        workspace={props.workspace}
      />,
    );
  });
};

/** 指定タイトルのタスクボタンを DOM から探してクリックする。 */
const clickTaskByTitle = (title: string) => {
  const button = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((b) => b.textContent?.includes(title));
  act(() => {
    button?.click();
  });
};

test("viewMode='board' で BoardView 経由の描画が成立する", async () => {
  const columns: ColumnType[] = [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ];
  renderActiveBoardView({
    viewMode: "board",
    filtered: [],
    workspace: makeWorkspace({ columns }),
  });
  await vi.waitFor(() => {
    const labels = Array.from(
      container?.querySelectorAll("section[aria-label]") ?? [],
    ).map((s) => s.getAttribute("aria-label"));
    expect(labels).toEqual(["Todo", "Done"]);
  });
});

const nonBoardCases: {
  viewMode: BoardViewMode;
  selector: string;
}[] = [
  { viewMode: "list", selector: "ul.divide-y" },
  { viewMode: "tree", selector: "ul.py-2" },
  { viewMode: "calendar", selector: "button[aria-label='前の月']" },
];

test.each(
  nonBoardCases,
)("viewMode='$viewMode' で該当ビューが描画され board 特有の section は出ない", async ({
  viewMode,
  selector,
}) => {
  renderActiveBoardView({
    viewMode,
    filtered: [makeTask({ id: "a", filePath: "tasks/a.md", title: "タスクA" })],
    workspace: makeWorkspace(),
  });
  await vi.waitFor(() => {
    expect(container?.querySelector(selector)).not.toBeNull();
  });
  expect(container?.querySelector("section[aria-label]")).toBeNull();
});

test("非 board ビューへ filtered が委譲され件数分描画される", async () => {
  renderActiveBoardView({
    viewMode: "list",
    filtered: [
      makeTask({ id: "a", filePath: "tasks/a.md", title: "A" }),
      makeTask({ id: "b", filePath: "tasks/b.md", title: "B" }),
    ],
    workspace: makeWorkspace(),
  });
  await vi.waitFor(() => {
    expect(container?.querySelectorAll("ul.divide-y > li").length).toBe(2);
  });
});

test.each(
  nonBoardCases,
)("viewMode='$viewMode' でタスククリック時に workspace.onTaskClick(task.id) が発火する", async ({
  viewMode,
}) => {
  const onTaskClick = vi.fn();
  renderActiveBoardView({
    viewMode,
    filtered: [makeTask({ id: "a", filePath: "tasks/a.md", title: "タスクA" })],
    workspace: makeWorkspace({ onTaskClick }),
  });
  await vi.waitFor(() => {
    const hit = Array.from(
      container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).some((b) => b.textContent?.includes("タスクA"));
    expect(hit).toBe(true);
  });
  clickTaskByTitle("タスクA");
  expect(onTaskClick).toHaveBeenCalledTimes(1);
  expect(onTaskClick).toHaveBeenCalledWith("a");
});

test("board で allTasks(絞り込み前) と filtered(絞り込み後) が別々に BoardView へ委譲される", async () => {
  const parent = makeTask({
    id: "p",
    filePath: "tasks/p.md",
    title: "親",
    status: "Todo",
    children: ["tasks/c.md"],
  });
  const child = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    title: "子",
    status: "Done",
    parent: "tasks/p.md",
  });
  renderActiveBoardView({
    viewMode: "board",
    filtered: [parent],
    workspace: makeWorkspace({
      columns: [{ name: "Todo", order: 0 }],
      tasks: [parent, child],
      doneColumn: "Done",
    }),
  });
  await vi.waitFor(() => {
    expect(
      container?.querySelector("[data-testid='task-card']"),
    ).not.toBeNull();
  });
  // 表示カードは filtered 由来の 1 件のみ。
  expect(container?.querySelectorAll("[data-testid='task-card']").length).toBe(
    1,
  );
  // 階層カウントは allTasks(=workspace.tasks) 由来で total=1 が算出される。
  const badge = container?.querySelector(
    "[data-testid='task-card-subissue-count']",
  );
  expect(badge?.textContent).toBe("1/1");
});
