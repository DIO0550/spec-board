import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FileTreeNode } from "@/features/shell/lib/buildFileTree";
import { Task, type TaskPayload } from "@/types/task";
import { FileNodeItem } from "..";

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
    ...overrides,
  });

const fileNode = (task: Task, name: string): FileTreeNode => ({
  kind: "file",
  name,
  task,
});

const dirNode = (
  name: string,
  path: string,
  children: FileTreeNode[],
): FileTreeNode => ({ kind: "dir", name, path, children });

const render = (props: Parameters<typeof FileNodeItem>[0]) => {
  act(() => {
    root?.render(createElement("ul", null, createElement(FileNodeItem, props)));
  });
};

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** トグルボタン（dir 時のみ描画される aria-expanded 付き button）を取得する。 */
const toggleButtons = (): HTMLButtonElement[] =>
  Array.from(container?.querySelectorAll("button[aria-expanded]") ?? []);

/** file ボタン（aria-expanded を持たない button）を取得する。 */
const fileButton = (): HTMLButtonElement | null =>
  container?.querySelector("button:not([aria-expanded])") ?? null;

test("file ノードのボタン click で onSelect が task.id 引数で発火する", () => {
  const onSelect = vi.fn();
  render({
    node: fileNode(createTask({ id: "task-9" }), "task.md"),
    depth: 0,
    onSelect,
  });

  click(fileButton());

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("task-9");
});

test("selectedTaskId 一致で選択クラス（bg-accent-soft）が付与される", () => {
  render({
    node: fileNode(createTask({ id: "sel" }), "task.md"),
    depth: 0,
    selectedTaskId: "sel",
    onSelect: vi.fn(),
  });

  expect(fileButton()?.className).toContain("bg-accent-soft");
});

test.each([
  { label: "別 id", selectedTaskId: "other" as string | null },
  { label: "null", selectedTaskId: null as string | null },
])("selectedTaskId が $label のとき非選択クラス（hover:bg-surface-muted）になる", ({
  selectedTaskId,
}) => {
  render({
    node: fileNode(createTask({ id: "sel" }), "task.md"),
    depth: 0,
    selectedTaskId,
    onSelect: vi.fn(),
  });

  const className = fileButton()?.className ?? "";
  expect(className).not.toContain("bg-accent-soft");
  expect(className).toContain("hover:bg-surface-muted");
});

test("file ノードは title 属性に task.title、表示テキストに name を持つ", () => {
  render({
    node: fileNode(createTask({ title: "ログイン修正" }), "login-fix.md"),
    depth: 0,
    onSelect: vi.fn(),
  });

  const span = container?.querySelector("button span[title]");
  expect(span?.getAttribute("title")).toBe("ログイン修正");
  expect(span?.textContent).toBe("login-fix.md");
});

test("dir 配下のネスト file にも selectedTaskId が再帰伝播しハイライトされる", () => {
  const childFile = fileNode(createTask({ id: "child" }), "child.md");
  render({
    node: dirNode("dir", "dir", [childFile]),
    depth: 0,
    selectedTaskId: "child",
    onSelect: vi.fn(),
  });

  expect(fileButton()?.className).toContain("bg-accent-soft");
});

test("dir ノードは展開状態でトグルと子 ul を描画する", () => {
  const childFile = fileNode(createTask({ id: "child" }), "child.md");
  render({
    node: dirNode("src", "src", [childFile]),
    depth: 0,
    onSelect: vi.fn(),
  });

  const [toggle] = toggleButtons();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.querySelector(".spec-file-tree-twisty-icon")).not.toBeNull();
  expect(
    toggle.querySelector(".spec-file-tree-icon-folder svg"),
  ).not.toBeNull();
  expect(container?.textContent).toContain("child.md");
});

test("dir トグル click で折りたたみ・再 click で復帰する", () => {
  const childFile = fileNode(createTask({ id: "child" }), "child.md");
  render({
    node: dirNode("src", "src", [childFile]),
    depth: 0,
    onSelect: vi.fn(),
  });

  click(toggleButtons()[0]);
  const collapsed = toggleButtons()[0];
  expect(collapsed.getAttribute("aria-expanded")).toBe("false");
  expect(
    collapsed.querySelector(".spec-file-tree-twisty.is-collapsed"),
  ).not.toBeNull();
  expect(container?.textContent).not.toContain("child.md");

  click(collapsed);
  const expanded = toggleButtons()[0];
  expect(expanded.getAttribute("aria-expanded")).toBe("true");
  expect(container?.textContent).toContain("child.md");
});

test.each([
  { depth: 0, expected: "0px" },
  { depth: 3, expected: "36px" },
])("depth=$depth のとき twisty の marginLeft が $expected", ({
  depth,
  expected,
}) => {
  render({
    node: fileNode(createTask(), "task.md"),
    depth,
    onSelect: vi.fn(),
  });

  expect(
    fileButton()?.querySelector<HTMLElement>(".spec-file-tree-twisty")?.style
      .marginLeft,
  ).toBe(expected);
});

test("空 dir でもトグルボタンが描画される（リーフ扱いにならない）", () => {
  render({
    node: dirNode("empty", "empty", []),
    depth: 0,
    onSelect: vi.fn(),
  });

  expect(toggleButtons()).toHaveLength(1);
});

test("ある dir のトグルは兄弟 dir の折りたたみ state に波及しない", () => {
  const dirA = dirNode("dirA", "dirA", [
    fileNode(createTask({ id: "fa" }), "fileA.md"),
  ]);
  const dirB = dirNode("dirB", "dirB", [
    fileNode(createTask({ id: "fb" }), "fileB.md"),
  ]);
  render({
    node: dirNode("root", "root", [dirA, dirB]),
    depth: 0,
    onSelect: vi.fn(),
  });

  // トグルは DOM 順で root, dirA, dirB の 3 つ
  const toggles = toggleButtons();
  expect(toggles).toHaveLength(3);

  click(toggles[1]);

  expect(container?.textContent).not.toContain("fileA.md");
  expect(container?.textContent).toContain("fileB.md");
});

test("同一位置で file→dir に切り替えても Hooks 順序が崩れず描画される", () => {
  render({
    node: fileNode(createTask({ id: "x" }), "x.md"),
    depth: 0,
    onSelect: vi.fn(),
  });
  expect(fileButton()).toBeTruthy();

  render({
    node: dirNode("x", "x", [fileNode(createTask({ id: "y" }), "y.md")]),
    depth: 0,
    onSelect: vi.fn(),
  });

  expect(toggleButtons()).toHaveLength(1);
  expect(container?.textContent).toContain("y.md");
});

test.each([
  { status: "In Progress", marker: "●", className: "progress" },
  { status: "Done", marker: "✓", className: "done" },
])("status=$status の file row は状態マークを表示する", ({
  status,
  marker,
  className,
}) => {
  render({
    node: fileNode(createTask({ status }), "task.md"),
    depth: 0,
    onSelect: vi.fn(),
  });

  const statusMark = container?.querySelector(
    `.spec-file-tree-status-${className}`,
  );
  expect(statusMark?.textContent).toBe(marker);
});

test("file row はExplorerのMarkdownアイコンと22px行構造を持つ", () => {
  render({
    node: fileNode(createTask(), "task.md"),
    depth: 0,
    onSelect: vi.fn(),
  });

  const row = fileButton();
  expect(row?.className).toContain("spec-file-tree-row");
  expect(
    row?.querySelector(".spec-file-tree-icon-markdown svg"),
  ).not.toBeNull();
  expect(row?.querySelector(".spec-file-tree-name")?.textContent).toBe(
    "task.md",
  );
});
