import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import type { TaskTreeNode } from "@/domains/task-forest";
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
    filePath: taskFilePathFixture("tasks/test.md"),
    // due は未設定（DueBadge の today 依存を回避）
    ...overrides,
  });

const node = (
  filePath: ReturnType<typeof taskFilePathFixture>,
  children: TaskTreeNode[] = [],
): TaskTreeNode => ({ filePath, children });

/** ノードが参照する Task を lookup Map に詰める。 */
const lookup = (
  ...tasks: Task[]
): ReadonlyMap<ReturnType<typeof taskFilePathFixture>, Task> =>
  new Map(tasks.map((task) => [task.filePath, task]));

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
  const task = createTask();
  render({
    node: node(task.filePath),
    depth: 0,
    tasksByFilePath: lookup(task),
    onSelect: vi.fn(),
  });

  expect(toggleButtons()).toHaveLength(0);
  expect(container?.querySelector('span[aria-hidden="true"].w-5')).toBeTruthy();
});

test("タイトルボタン click で onSelect が task.id 引数で発火する", () => {
  const onSelect = vi.fn();
  const task = createTask({ id: "task-42" });
  render({
    node: node(task.filePath),
    depth: 0,
    tasksByFilePath: lookup(task),
    onSelect,
  });

  click(titleButton());

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("task-42");
});

test("子ありノードではトグルボタンが展開状態で描画され子 ul が表示される", () => {
  const parent = createTask();
  const child = createTask({
    id: "child-1",
    title: "子",
    filePath: taskFilePathFixture("tasks/child.md"),
  });
  render({
    node: node(parent.filePath, [node(child.filePath)]),
    depth: 0,
    tasksByFilePath: lookup(parent, child),
    onSelect: vi.fn(),
  });

  const [toggle] = toggleButtons();
  expect(toggle).toBeTruthy();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.getAttribute("aria-label")).toBe("折りたたむ");
  expect(toggle.textContent).toBe("▾");
  expect(container?.textContent).toContain("子");
});

test("トグル click で折りたたみ・再 click で復帰する", () => {
  const parent = createTask();
  const child = createTask({
    id: "child-1",
    title: "子タスク",
    filePath: taskFilePathFixture("tasks/child.md"),
  });
  render({
    node: node(parent.filePath, [node(child.filePath)]),
    depth: 0,
    tasksByFilePath: lookup(parent, child),
    onSelect: vi.fn(),
  });

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
  const task = createTask();
  render({
    node: node(task.filePath),
    depth,
    tasksByFilePath: lookup(task),
    onSelect: vi.fn(),
  });

  const row = container?.querySelector("li > div");
  expect((row as HTMLElement | null)?.style.paddingLeft).toBe(expected);
});

test("子には depth + 1 が渡り 1 段深いインデントで描画される", () => {
  const parent = createTask();
  const child = createTask({
    id: "child-1",
    title: "子",
    filePath: taskFilePathFixture("tasks/child.md"),
  });
  render({
    node: node(parent.filePath, [node(child.filePath)]),
    depth: 1,
    tasksByFilePath: lookup(parent, child),
    onSelect: vi.fn(),
  });

  const rows = Array.from(container?.querySelectorAll("li > div") ?? []);
  expect((rows[0] as HTMLElement).style.paddingLeft).toBe("16px");
  expect((rows[1] as HTMLElement).style.paddingLeft).toBe("32px");
});

test("lookup が外れたノードは行を描画しない", () => {
  render({
    node: node(taskFilePathFixture("tasks/missing.md")),
    depth: 0,
    tasksByFilePath: lookup(),
    onSelect: vi.fn(),
  });

  expect(container?.querySelector("li")).toBeNull();
});

test("title と status が描画される", () => {
  const task = createTask({ title: "ログイン修正", status: "Doing" });
  render({
    node: node(task.filePath),
    depth: 0,
    tasksByFilePath: lookup(task),
    onSelect: vi.fn(),
  });

  expect(container?.textContent).toContain("ログイン修正");
  expect(container?.textContent).toContain("Doing");
});

test("あるノードのトグルは兄弟ノードの折りたたみ state に波及しない", () => {
  const parent = createTask();
  const childA = createTask({
    id: "child-a",
    title: "子A",
    filePath: taskFilePathFixture("tasks/child-a.md"),
  });
  const childB = createTask({
    id: "child-b",
    title: "子B",
    filePath: taskFilePathFixture("tasks/child-b.md"),
  });
  const grandchildA = createTask({
    id: "gc-a",
    title: "孫A",
    filePath: taskFilePathFixture("tasks/gc-a.md"),
  });
  const grandchildB = createTask({
    id: "gc-b",
    title: "孫B",
    filePath: taskFilePathFixture("tasks/gc-b.md"),
  });
  render({
    node: node(parent.filePath, [
      node(childA.filePath, [node(grandchildA.filePath)]),
      node(childB.filePath, [node(grandchildB.filePath)]),
    ]),
    depth: 0,
    tasksByFilePath: lookup(parent, childA, childB, grandchildA, grandchildB),
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
