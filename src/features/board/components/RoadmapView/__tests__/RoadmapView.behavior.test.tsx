import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { RoadmapView } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const columns: Column[] = [
  { name: "Todo", order: 0, color: "#64748b" },
  { name: "In Progress", order: 1, color: "#3b82f6" },
  { name: "Done", order: 2, color: "#22c55e" },
];

const makeTask = (overrides: Partial<TaskPayload> = {}) =>
  Task.fromPayload({
    id: "epic",
    title: "認証基盤",
    status: "In Progress",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/epic.md",
    extras: { start: "2026-04-20" },
    due: "2026-05-03",
    ...overrides,
  });

const epic = makeTask({
  children: ["tasks/child-a.md", "tasks/child-b.md"],
});
const childA = makeTask({
  id: "child-a",
  title: "ログイン画面",
  status: "Done",
  filePath: "tasks/child-a.md",
  parent: "tasks/epic.md",
  extras: { start: "2026-04-21" },
  due: "2026-04-24",
});
const childB = makeTask({
  id: "child-b",
  title: "セッション管理",
  status: "Todo",
  filePath: "tasks/child-b.md",
  parent: "tasks/epic.md",
  extras: { start: "2026-04-25" },
  due: "2026-04-30",
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

const renderRoadmap = (
  overrides: Partial<Parameters<typeof RoadmapView>[0]> = {},
) => {
  act(() => {
    root?.render(
      <RoadmapView
        tasks={[epic, childA, childB]}
        columns={columns}
        doneColumn="Done"
        today="2026-04-26"
        {...overrides}
      />,
    );
  });
};

test("toolbar・Epic group・追加ボタン・status legend を描画する", () => {
  renderRoadmap();
  expect(
    container?.querySelector("[aria-label='ロードマップ表示単位']"),
  ).not.toBeNull();
  expect(container?.textContent).toContain("日");
  expect(container?.textContent).toContain("週");
  expect(container?.textContent).toContain("グループ: Epic");
  expect(container?.textContent).toContain("Epicを追加");
  expect(container?.querySelectorAll("[data-roadmap-legend]").length).toBe(3);
});

test("sticky header・left label・日単位grid・weekend・todayを描画する", () => {
  renderRoadmap();
  const roadmap = container?.querySelector<HTMLElement>("[data-roadmap]");
  expect(roadmap?.style.getPropertyValue("--roadmap-left-width")).toBe("280px");
  expect(roadmap?.style.getPropertyValue("--roadmap-day-width")).toBe("28px");
  expect(
    container?.querySelector("[data-roadmap-month-header]"),
  ).not.toBeNull();
  expect(container?.querySelector("[data-roadmap-day-header]")).not.toBeNull();
  expect(container?.querySelector("[data-roadmap-weekend]")).not.toBeNull();
  expect(
    container?.querySelector("[data-roadmap-today]")?.textContent,
  ).toContain("今日");
  expect(
    container?.querySelector("[data-roadmap-left-header]")?.className,
  ).toContain("sticky");
});

test("fullscreen親のviewport残高を幅高さとも埋める", () => {
  renderRoadmap();
  const roadmap = container?.querySelector<HTMLElement>("[data-roadmap]");

  expect(roadmap?.className).toContain("h-full");
  expect(roadmap?.className).toContain("w-full");
  expect(roadmap?.className).toContain("min-h-0");
});

test("Epic・child・進捗・期間を表示し展開を切り替えられる", () => {
  renderRoadmap();
  expect(container?.textContent).toContain("認証基盤");
  expect(container?.textContent).toContain("ログイン画面");
  expect(container?.textContent).toContain("1/2");
  expect(container?.textContent).toContain("4/20 – 5/3");

  const toggle = container?.querySelector<HTMLButtonElement>(
    "[aria-label='認証基盤を折りたたむ']",
  );
  act(() => toggle?.click());
  expect(container?.textContent).not.toContain("ログイン画面");
  expect(
    container?.querySelector("[aria-label='認証基盤を展開する']"),
  ).not.toBeNull();
});

test("表記揺れraw parentのchildを重複Epicとして表示しない", () => {
  const rawParentChild = makeTask({
    id: "child-a",
    title: "ログイン画面",
    status: "Done",
    filePath: "tasks/child-a.md",
    parent: ".\\tasks\\epic.md",
  });
  renderRoadmap({ tasks: [epic, rawParentChild] });

  const childBars = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-roadmap-bar]") ?? [],
  ).filter((bar) => bar.textContent === "ログイン画面");
  expect(childBars).toHaveLength(1);
});

test("週表示へ切り替えるとtimelineを縮小する", () => {
  renderRoadmap();
  const weekButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent?.trim() === "週");
  act(() => weekButton?.click());
  expect(
    container
      ?.querySelector<HTMLElement>("[data-roadmap]")
      ?.style.getPropertyValue("--roadmap-day-width"),
  ).toBe("16px");
  expect(weekButton?.getAttribute("aria-pressed")).toBe("true");
});

test("Epic追加とtask clickを通知する", () => {
  const onAddEpic = vi.fn();
  const onTaskClick = vi.fn();
  renderRoadmap({ onAddEpic, onTaskClick });
  const addButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent?.includes("Epicを追加"));
  act(() => addButton?.click());
  expect(onAddEpic).toHaveBeenCalledTimes(1);

  const taskButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent?.includes("ログイン画面"));
  act(() => taskButton?.click());
  expect(onTaskClick).toHaveBeenCalledWith("child-a");
});

test("taskが空でもheaderと空のfillerを表示する", () => {
  renderRoadmap({ tasks: [] });
  expect(
    container?.querySelector("[data-roadmap-month-header]"),
  ).not.toBeNull();
  expect(
    container?.querySelector("[data-roadmap-empty]")?.textContent,
  ).toContain("Epicがありません");
});
