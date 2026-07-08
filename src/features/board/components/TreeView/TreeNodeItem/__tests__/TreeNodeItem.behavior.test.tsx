import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskTreeNode } from "@/features/board/lib/buildTaskTree";
import { Task, type TaskPayload } from "@/types/task";
import { TreeNodeItem } from "..";

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

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    // due は未設定（DueBadge の today 依存を回避）
    ...overrides,
  });

const node = (
  task: Task,
  depth: number,
  children: TaskTreeNode[] = [],
): TaskTreeNode => ({ task, depth, children });

const render = (props: Parameters<typeof TreeNodeItem>[0]) => {
  act(() => {
    root?.render(createElement("ul", null, createElement(TreeNodeItem, props)));
  });
};

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** トグルボタン（子あり時のみ描画される aria-expanded 付き button）を取得する。 */
const toggleButtons = (): HTMLButtonElement[] =>
  Array.from(container?.querySelectorAll("button[aria-expanded]") ?? []);

/** タイトルボタン（トグルではない button）を取得する。 */
const titleButton = (): HTMLButtonElement | null =>
  container?.querySelector("button:not([aria-expanded])") ?? null;

test("子なしノードではトグルボタンがなくスペーサーが描画される", () => {
  render({ node: node(createTask(), 0), onSelect: vi.fn() });

  expect(toggleButtons()).toHaveLength(0);
  expect(container?.querySelector('span[aria-hidden="true"].w-5')).toBeTruthy();
});

test("タイトルボタン click で onSelect が task.id 引数で発火する", () => {
  const onSelect = vi.fn();
  render({ node: node(createTask({ id: "task-42" }), 0), onSelect });

  click(titleButton());

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("task-42");
});

test("子ありノードではトグルボタンが展開状態で描画され子 ul が表示される", () => {
  const child = node(createTask({ id: "child-1", title: "子" }), 1);
  render({ node: node(createTask(), 0, [child]), onSelect: vi.fn() });

  const [toggle] = toggleButtons();
  expect(toggle).toBeTruthy();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.getAttribute("aria-label")).toBe("折りたたむ");
  expect(toggle.textContent).toBe("▾");
  expect(container?.textContent).toContain("子");
});

test("トグル click で折りたたみ・再 click で復帰する", () => {
  const child = node(createTask({ id: "child-1", title: "子タスク" }), 1);
  render({ node: node(createTask(), 0, [child]), onSelect: vi.fn() });

  const [toggle] = toggleButtons();
  click(toggle);

  const collapsed = toggleButtons()[0];
  expect(collapsed.getAttribute("aria-expanded")).toBe("false");
  expect(collapsed.getAttribute("aria-label")).toBe("展開する");
  expect(collapsed.textContent).toBe("▸");
  expect(container?.textContent).not.toContain("子タスク");

  click(collapsed);
  const expanded = toggleButtons()[0];
  expect(expanded.getAttribute("aria-expanded")).toBe("true");
  expect(container?.textContent).toContain("子タスク");
});

test.each([
  { depth: 0, expected: "0px" },
  { depth: 2, expected: "32px" },
])("depth=$depth のとき行の paddingLeft が $expected", ({
  depth,
  expected,
}) => {
  render({ node: node(createTask(), depth), onSelect: vi.fn() });

  const row = container?.querySelector("li > div");
  expect((row as HTMLElement | null)?.style.paddingLeft).toBe(expected);
});

test("title と status が描画される", () => {
  render({
    node: node(createTask({ title: "ログイン修正", status: "Doing" }), 0),
    onSelect: vi.fn(),
  });

  expect(container?.textContent).toContain("ログイン修正");
  expect(container?.textContent).toContain("Doing");
});

test("あるノードのトグルは兄弟ノードの折りたたみ state に波及しない", () => {
  const grandchildA = node(createTask({ id: "gc-a", title: "孫A" }), 2);
  const grandchildB = node(createTask({ id: "gc-b", title: "孫B" }), 2);
  const childA = node(createTask({ id: "child-a", title: "子A" }), 1, [
    grandchildA,
  ]);
  const childB = node(createTask({ id: "child-b", title: "子B" }), 1, [
    grandchildB,
  ]);
  render({
    node: node(createTask(), 0, [childA, childB]),
    onSelect: vi.fn(),
  });

  // トグルボタンは DOM 順で root, childA, childB の 3 つ
  const toggles = toggleButtons();
  expect(toggles).toHaveLength(3);

  // childA（2 番目）のトグルだけを畳む
  click(toggles[1]);

  expect(container?.textContent).not.toContain("孫A");
  expect(container?.textContent).toContain("孫B");
});
