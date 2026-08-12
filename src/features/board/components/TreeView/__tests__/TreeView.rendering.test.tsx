import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskForest, type TaskForestPayloadInput } from "@/domains/task-forest";
import { Task } from "@/types/task";
import { TreeView } from "..";

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

const makeTask = (filePath: string, title: string): Task =>
  Task.fromPayload({
    id: filePath,
    title,
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath,
    // due は未設定（DueBadge の today 依存を回避）
    extras: {},
    warnings: [],
  });

const node = (
  filePath: string,
  children: TaskForestPayloadInput = [],
): TaskForestPayloadInput[number] => ({ filePath, children });

const forestOf = (payload: TaskForestPayloadInput) =>
  TaskForest.fromPayload(payload);

const render = (props: Parameters<typeof TreeView>[0]) => {
  act(() => {
    root?.render(createElement(TreeView, props));
  });
};

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** 各行（li > div）の paddingLeft を DOM 順に並べる。 */
const rowPaddings = (): string[] =>
  Array.from(container?.querySelectorAll("li > div") ?? []).map(
    (row) => (row as HTMLElement).style.paddingLeft,
  );

const titleButtons = (): HTMLButtonElement[] =>
  Array.from(
    container?.querySelectorAll("li button:not([aria-expanded])") ?? [],
  );

const toggleButtons = (): HTMLButtonElement[] =>
  Array.from(container?.querySelectorAll("button[aria-expanded]") ?? []);

test("tree の階層どおりに行が入れ子で描画される", () => {
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  render({
    tasks: [parent, child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  });

  expect(container?.querySelectorAll("li")).toHaveLength(2);
  expect(container?.querySelector("li > ul > li")).toBeTruthy();
});

test("インデントが深さに比例する", () => {
  const a = makeTask("tasks/a.md", "A");
  const b = makeTask("tasks/b.md", "B");
  const c = makeTask("tasks/c.md", "C");
  render({
    tasks: [a, b, c],
    taskTree: forestOf([
      node(a.filePath, [node(b.filePath, [node(c.filePath)])]),
    ]),
  });

  expect(rowPaddings()).toEqual(["0px", "16px", "32px"]);
});

test("絞り込みで親が消えた子は root として描画される", () => {
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  render({
    tasks: [child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  });

  expect(rowPaddings()).toEqual(["0px"]);
  expect(container?.textContent).toContain("子");
  expect(container?.textContent).not.toContain("親");
});

test("可視タスクが 0 件なら空メッセージを表示する", () => {
  render({
    tasks: [],
    taskTree: forestOf([node("tasks/a.md")]),
  });

  expect(container?.textContent).toContain("表示するタスクがありません");
});

test("tree に無い可視タスク（stale tree）も root として描画される", () => {
  const existing = makeTask("tasks/a.md", "既存");
  const created = makeTask("tasks/new.md", "新規");
  render({
    tasks: [existing, created],
    taskTree: forestOf([node(existing.filePath)]),
  });

  expect(rowPaddings()).toEqual(["0px", "0px"]);
  expect(container?.textContent).toContain("新規");
});

test("optimistic 作成中の新規タスクは root 列の末尾に描画される", () => {
  const first = makeTask("tasks/a.md", "A");
  const second = makeTask("tasks/b.md", "B");
  const created = makeTask("tasks/new.md", "新規");
  render({
    // applyTaskCreated は tasks の末尾に足す（同期後に board 順へ収まる受容仕様）
    tasks: [first, second, created],
    taskTree: forestOf([node(first.filePath), node(second.filePath)]),
  });

  const titles = titleButtons().map((button) => button.textContent);
  expect(titles[titles.length - 1]).toContain("新規");
});

test("行クリックで onTaskClick がタスク ID 付きで呼ばれる", () => {
  const onTaskClick = vi.fn();
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  render({
    tasks: [parent, child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
    onTaskClick,
  });

  click(titleButtons()[1]);

  expect(onTaskClick).toHaveBeenCalledTimes(1);
  expect(onTaskClick).toHaveBeenCalledWith("tasks/c.md");
});

test("子を持つノードのトグルは aria-expanded で展開状態を伝える", () => {
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  render({
    tasks: [parent, child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  });

  const [toggle] = toggleButtons();
  expect(toggle.getAttribute("aria-expanded")).toBe("true");

  click(toggle);

  expect(toggleButtons()[0].getAttribute("aria-expanded")).toBe("false");
});

test("トグルはネイティブ button なのでキーボードで操作できる", () => {
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  render({
    tasks: [parent, child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  });

  const [toggle] = toggleButtons();
  expect(toggle.tagName).toBe("BUTTON");
  expect(toggle.getAttribute("type")).toBe("button");
});

test("構造が同じ別インスタンスの taskTree を渡しても折りたたみ状態が巻き戻らない", () => {
  const parent = makeTask("tasks/p.md", "親");
  const child = makeTask("tasks/c.md", "子");
  const props = {
    tasks: [parent, child],
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  };
  render(props);
  click(toggleButtons()[0]);
  expect(container?.textContent).not.toContain("子");

  render({
    tasks: props.tasks,
    taskTree: forestOf([node(parent.filePath, [node(child.filePath)])]),
  });

  expect(toggleButtons()[0].getAttribute("aria-expanded")).toBe("false");
  expect(container?.textContent).not.toContain("子");
});

test("500 段の深いネストでも描画がスタックを溢れさせない", () => {
  const depth = 500;
  const tasks = Array.from({ length: depth }, (_unused, index) =>
    makeTask(`tasks/node-${index}.md`, `N${index}`),
  );
  let chain: TaskForestPayloadInput = [];
  for (let index = depth - 1; index >= 0; index -= 1) {
    chain = [node(`tasks/node-${index}.md`, chain)];
  }

  render({ tasks, taskTree: forestOf(chain) });

  expect(container?.querySelectorAll("li")).toHaveLength(depth);
  const paddings = rowPaddings();
  expect(paddings[paddings.length - 1]).toBe(`${(depth - 1) * 16}px`);
});
