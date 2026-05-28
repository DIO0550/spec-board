import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";

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
    id: "task-1",
    title: "テスト",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

const render = (props: Parameters<typeof TaskCard>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskCard, props));
  });
};

test("hasBrokenLink=true で WarningIcon が描画される", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasBrokenLink: true,
  });
  const icon = document.querySelector('[data-testid="warning-icon"]');
  expect(icon).not.toBeNull();
});

test("hasBrokenLink=false で WarningIcon が描画されない", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasBrokenLink: false,
  });
  expect(document.querySelector('[data-testid="warning-icon"]')).toBeNull();
});

test("hasBrokenLink 未指定で WarningIcon が描画されない", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
  });
  expect(document.querySelector('[data-testid="warning-icon"]')).toBeNull();
});

test("カードは可視テキストラベル『リンク切れ』を表示しない (SVG title は除外)", () => {
  render({
    task: makeTask({ title: "あるタスク" }),
    fromColumn: "Todo",
    hasBrokenLink: true,
  });
  const card = document.querySelector('[data-testid="task-card"]');
  const titleEl = card?.querySelector('[data-testid="task-card-title"]');
  expect(titleEl?.textContent).toBe("あるタスク");
  const labels = card?.querySelectorAll("span, p, div");
  const visibleLabels = Array.from(labels ?? []).map((el) => el.textContent);
  expect(visibleLabels).not.toContain("リンク切れ");
});

test("WarningIcon の aria-label は『リンク切れあり』である", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasBrokenLink: true,
  });
  const icon = document.querySelector('[data-testid="warning-icon"]');
  expect(icon?.getAttribute("aria-label")).toBe("リンク切れあり");
});

test("onClick あり (役割=button) でも hasBrokenLink=true で WarningIcon が出る", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasBrokenLink: true,
    onClick: vi.fn(),
  });
  expect(document.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
});
