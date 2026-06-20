import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";
import { type CardWrapperArgs, wrapWithCardProvider } from "./_testHelpers";

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

function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
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
}

/**
 * BoardCardProvider 配下に TaskCard を mount する。
 * @param props TaskCard に渡す props（fromColumn はデフォルト "Todo"）
 * @param providerArgs Provider に追加で渡す引数（allTasks / doneColumn 等）
 */
function render(
  props: Omit<Parameters<typeof TaskCard>[0], "fromColumn">,
  providerArgs: CardWrapperArgs = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      wrapWithCardProvider(<TaskCard fromColumn="Todo" {...props} />, {
        task: props.task,
        ...providerArgs,
      }),
    );
  });
}

test("タイトルが表示される", async () => {
  render({ task: createTask({ title: "ログイン修正" }), onClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ログイン修正");
  });
});

test("カードクリックでonClickが呼ばれる", async () => {
  const onClick = vi.fn();
  render({ task: createTask({ id: "task-42" }), onClick });
  await vi.waitFor(() => {
    expect(container?.querySelector('[role="button"]')).toBeTruthy();
  });
  const card = container?.querySelector('[role="button"]') as HTMLElement;
  card.click();
  expect(onClick).toHaveBeenCalledWith("task-42");
});

test("onClick未指定の場合、divで描画されボタンにならない", async () => {
  render({ task: createTask({ title: "非インタラクティブ" }) });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("非インタラクティブ");
  });
  const button = container?.querySelector("button");
  expect(button).toBeNull();
  const div = container?.querySelector("div");
  expect(div).toBeTruthy();
});

test("titleが未設定の場合、filePathが表示される", async () => {
  render({
    task: createTask({ title: "", filePath: "tasks/my-task.md" }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("tasks/my-task.md");
  });
});

test("priority が High の場合、赤いバッジが表示される", async () => {
  render({ task: createTask({ priority: "High" }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const badge = container?.querySelector("span.bg-red-100");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("High");
  });
});

test("labels が ['bug', 'frontend'] の場合、2つのタグが表示される", async () => {
  render({
    task: createTask({ labels: ["bug", "frontend"] }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const tags = container?.querySelectorAll('[data-testid="label-tag"]');
    expect(tags?.length).toBe(2);
    expect(tags?.[0]?.textContent).toBe("bug");
    expect(tags?.[1]?.textContent).toBe("frontend");
  });
});

test("priority 未設定でバッジ非表示", async () => {
  render({ task: createTask({ priority: undefined }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const badge = container?.querySelector(
      ".bg-red-100, .bg-yellow-100, .bg-blue-100",
    );
    expect(badge).toBeNull();
  });
});

test("labels が空配列でタグ領域非表示", async () => {
  render({ task: createTask({ labels: [] }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const tagContainer = container?.querySelector(".flex-wrap");
    expect(tagContainer).toBeNull();
  });
});

test("ラベルが5個以上で折り返し表示", async () => {
  render({
    task: createTask({
      labels: ["bug", "frontend", "urgent", "design", "refactor"],
    }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const tags = container?.querySelectorAll('[data-testid="label-tag"]');
    expect(tags?.length).toBe(5);
    const wrapper = container?.querySelector(".flex-wrap");
    expect(wrapper).toBeTruthy();
  });
});

test("descendantTasks ベースで進捗サマリが表示される（直下子 2 + 孫 3 で 3/5）", async () => {
  const c1 = createTask({
    id: "c1",
    status: "Todo",
    filePath: "tasks/c1.md",
    children: ["tasks/g1.md", "tasks/g2.md"],
  });
  const c2 = createTask({
    id: "c2",
    status: "Done",
    filePath: "tasks/c2.md",
    children: ["tasks/g3.md"],
  });
  const g1 = createTask({ id: "g1", status: "Done", filePath: "tasks/g1.md" });
  const g2 = createTask({ id: "g2", status: "Done", filePath: "tasks/g2.md" });
  const g3 = createTask({ id: "g3", status: "Todo", filePath: "tasks/g3.md" });
  const parent = createTask({
    id: "parent",
    title: "親",
    filePath: "tasks/parent.md",
    children: ["tasks/c1.md", "tasks/c2.md"],
  });
  render(
    { task: parent, onClick: vi.fn() },
    { allTasks: [parent, c1, c2, g1, g2, g3], doneColumn: "Done" },
  );
  await vi.waitFor(() => {
    const bar = container?.querySelector(
      "[role='progressbar']",
    ) as HTMLElement | null;
    expect(bar?.getAttribute("aria-valuenow")).toBe("60");
    expect(container?.textContent).toContain("3/5");
  });
});

test("フッターにタスク ID が常時表示される（links 0 / 子孫 0）", async () => {
  render({
    task: createTask({ id: "task-99", links: [], children: [] }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const id = container?.querySelector('[data-testid="task-card-id"]');
    expect(id?.textContent).toBe("task-99");
  });
});

test("links が 2 件の場合、フッターにリンク件数が表示される", async () => {
  render({
    task: createTask({ links: ["tasks/a.md", "tasks/b.md"] }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const linkCount = container?.querySelector(
      '[data-testid="task-card-link-count"]',
    );
    expect(linkCount?.textContent).toContain("2");
  });
});

test("links が 0 件の場合、リンク件数要素は表示されない", async () => {
  render({ task: createTask({ links: [] }), onClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("task-1");
  });
  const linkCount = container?.querySelector(
    '[data-testid="task-card-link-count"]',
  );
  expect(linkCount).toBeNull();
});

test("子孫が存在する場合、フッターにサブIssue X/Y が表示される", async () => {
  const c1 = createTask({
    id: "c1",
    status: "Done",
    filePath: "tasks/c1.md",
    children: ["tasks/c2.md"],
  });
  const c2 = createTask({ id: "c2", status: "Todo", filePath: "tasks/c2.md" });
  const parent = createTask({
    id: "parent",
    filePath: "tasks/parent.md",
    children: ["tasks/c1.md"],
  });
  render(
    { task: parent, onClick: vi.fn() },
    { allTasks: [parent, c1, c2], doneColumn: "Done" },
  );
  await vi.waitFor(() => {
    const count = container?.querySelector(
      '[data-testid="task-card-subissue-count"]',
    );
    expect(count?.textContent).toBe("1/2");
  });
});

test("子孫が 0 件の場合、サブIssue X/Y 要素は表示されない", async () => {
  render(
    {
      task: createTask({ id: "task-1", children: [] }),
      childTasks: [],
      onClick: vi.fn(),
    },
    { doneColumn: "Done" },
  );
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("task-1");
  });
  const count = container?.querySelector(
    '[data-testid="task-card-subissue-count"]',
  );
  expect(count).toBeNull();
});

test("長いタスク ID は truncate クラスで省略表示される", async () => {
  render({
    task: createTask({
      id: "this-is-an-extremely-long-task-identifier-that-should-be-truncated",
    }),
    onClick: vi.fn(),
  });
  await vi.waitFor(() => {
    const id = container?.querySelector('[data-testid="task-card-id"]');
    expect(id?.className).toContain("truncate");
  });
});
