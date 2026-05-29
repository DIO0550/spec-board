import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { Task, type TaskPayload, type TaskWarning } from "@/types/task";
import { CycleWarningBanner } from "..";

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
 * テスト用の Task を生成するファクトリ。
 * @param warnings - 注入する warnings 配列
 * @returns Task
 */
const makeTask = (warnings: TaskWarning[]): Task => {
  const payload: TaskPayload = {
    id: "task-1",
    title: "サンプル",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/sample.md",
    extras: {},
    warnings,
  };
  return Task.fromPayload(payload);
};

/**
 * CycleWarningBanner をレンダリングするヘルパー。
 * @param task - 注入する Task
 */
const render = (task: Task) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(CycleWarningBanner, { task }));
  });
};

const cycleWarning: TaskWarning = {
  code: "parentCycle",
  field: "parent",
  message: "parent chain forms a cycle",
};

const parentNotFoundWarning: TaskWarning = {
  code: "parentNotFound",
  field: "parent",
  message: "parent task was not found",
};

test("parentCycle warning を持つとき role=alert 要素が描画される", () => {
  render(makeTask([cycleWarning]));
  const banner = container?.querySelector('[role="alert"]');
  expect(banner).not.toBeNull();
  expect(banner?.getAttribute("data-testid")).toBe("cycle-warning-banner");
});

test("バナーのメッセージに『親タスクが循環しています』が含まれる", () => {
  render(makeTask([cycleWarning]));
  const banner = container?.querySelector(
    '[data-testid="cycle-warning-banner"]',
  );
  expect(banner?.textContent).toContain("親タスクが循環しています");
});

test("warnings が空のとき何もレンダーされない", () => {
  render(makeTask([]));
  const banner = container?.querySelector(
    '[data-testid="cycle-warning-banner"]',
  );
  expect(banner).toBeNull();
});

test("parentNotFound のみのとき、バナーは表示されない", () => {
  render(makeTask([parentNotFoundWarning]));
  const banner = container?.querySelector(
    '[data-testid="cycle-warning-banner"]',
  );
  expect(banner).toBeNull();
});

test("parentCycle と parentNotFound が併存していてもバナーが表示される", () => {
  render(makeTask([cycleWarning, parentNotFoundWarning]));
  const banner = container?.querySelector(
    '[data-testid="cycle-warning-banner"]',
  );
  expect(banner).not.toBeNull();
});
