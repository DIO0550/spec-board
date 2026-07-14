import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import {
  type BoardColumnApi,
  BoardColumnProvider,
  type BoardColumnProviderProps,
  useBoardColumn,
} from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

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
 * @param patch 上書きしたい一部フィールド
 * @returns Task
 */
const makeTask = (patch: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: patch.id ?? "id",
    title: patch.title ?? "title",
    status: patch.status ?? "Todo",
    labels: patch.labels ?? [],
    body: patch.body ?? "",
    filePath: patch.filePath ?? "tasks/x.md",
    links: patch.links ?? [],
    reverseLinks: patch.reverseLinks ?? [],
    children: patch.children ?? [],
    parent: patch.parent,
  });

/**
 * useBoardColumn の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (api: BoardColumnApi) => void }) => {
  const api = useBoardColumn();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * BoardColumnProvider 配下に Probe を mount し、latest API を観測する。
 * @param overrides 上書きしたい Provider props（children 以外）
 * @returns latest accessor
 */
const mountProbe = (
  overrides: Partial<Omit<BoardColumnProviderProps, "children">> = {},
) => {
  let latest: BoardColumnApi | null = null;
  const handleResult = (api: BoardColumnApi) => {
    latest = api;
  };
  const tree: ReactNode = (
    <StrictMode>
      <BoardColumnProvider
        columns={overrides.columns ?? []}
        tasks={overrides.tasks ?? []}
        allTasks={overrides.allTasks}
      >
        <Probe onResult={handleResult} />
      </BoardColumnProvider>
    </StrictMode>
  );
  act(() => {
    root?.render(tree);
  });
  return {
    get latest(): BoardColumnApi {
      return latest as BoardColumnApi;
    },
  };
};

const COLUMNS: readonly Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

test("existingNames は全 column 名を columns 順で返す", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.existingNames()).toEqual(["Todo", "In Progress", "Done"]);
});

test("existingNamesExcluding は currentName を除外した配列を返す", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.existingNamesExcluding("In Progress")).toEqual([
    "Todo",
    "Done",
  ]);
});

test("existingNamesExcluding に存在しない名前を渡しても全件返す", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.existingNamesExcluding("missing")).toEqual([
    "Todo",
    "In Progress",
    "Done",
  ]);
});

test("canDelete は columns.length === 1 で false を返す", () => {
  const probe = mountProbe({ columns: [COLUMNS[0]] });
  expect(probe.latest.canDelete("Todo")).toBe(false);
});

test("canDelete は columns.length >= 2 で true を返す", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.canDelete("Todo")).toBe(true);
});

test("columnDraggable は columns.length === 1 で false", () => {
  const probe = mountProbe({ columns: [COLUMNS[0]] });
  expect(probe.latest.columnDraggable).toBe(false);
});

test("columnDraggable は columns.length >= 2 で true", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.columnDraggable).toBe(true);
});

test("columnDraggable と canDelete は同値だが別プロパティ（値 vs 関数）", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.columnDraggable).toBe(probe.latest.canDelete("Todo"));
  expect(typeof probe.latest.columnDraggable).toBe("boolean");
  expect(typeof probe.latest.canDelete).toBe("function");
});

test("taskCountInColumn は hierarchyTasks (allTasks ?? tasks) を status 別に集計する", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const b = makeTask({ id: "b", filePath: "tasks/b.md", status: "Todo" });
  const c = makeTask({
    id: "c",
    filePath: "tasks/c.md",
    status: "In Progress",
  });
  const probe = mountProbe({
    columns: COLUMNS,
    tasks: [a],
    allTasks: [a, b, c],
  });
  expect(probe.latest.taskCountInColumn("Todo")).toBe(2);
  expect(probe.latest.taskCountInColumn("In Progress")).toBe(1);
});

test("taskCountInColumn は allTasks 未指定なら tasks を hierarchyTasks として集計する", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = mountProbe({ columns: COLUMNS, tasks: [a] });
  expect(probe.latest.taskCountInColumn("Todo")).toBe(1);
});

test("taskCountInColumn は存在しない column 名で 0 を返す", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.taskCountInColumn("missing")).toBe(0);
});

test("orderOf は columns.find の order を返し、不在で undefined", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.orderOf("Todo")).toBe(0);
  expect(probe.latest.orderOf("In Progress")).toBe(1);
  expect(probe.latest.orderOf("missing")).toBeUndefined();
});
