import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { ParentLink } from "..";

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
 * @param overrides - 上書きフィールド
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "parent",
    title: "親タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent.md",
    ...overrides,
  });

/**
 * ParentLink をレンダリングするヘルパー。
 * @param props - ParentLink に渡す props
 */
const render = (props: Parameters<typeof ParentLink>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParentLink, props));
  });
};

test("click で onSelect(parentTask.id) が 1 回呼ばれる", () => {
  const onSelect = vi.fn();
  const parent = makeTask({ id: "parent-id-42" });
  render({ parentTask: parent, onSelect });
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  act(() => {
    button?.click();
  });
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("parent-id-42");
});
