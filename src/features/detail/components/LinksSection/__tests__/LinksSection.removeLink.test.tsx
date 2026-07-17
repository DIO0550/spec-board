import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { Result } from "@/utils/result";
import { LinksSection } from "..";

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
 * Task fixture を生成する。
 * @param overrides TaskFromPayloadInput の上書き値
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: overrides.title ?? "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

/**
 * LinksSection を render する。
 * @param props LinksSection への props
 */
const render = (props: Parameters<typeof LinksSection>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LinksSection, props));
  });
};

const noopOnAddLink = vi.fn(async () =>
  Result.ok(makeTask({ filePath: "tasks/x.md" })),
);

test("linked リンクの各 li に × ボタンが表示される（testid / aria-label / 表示文字）", () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md", "tasks/b.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: vi.fn(async () => Result.ok(self)),
  });

  const expected: ReadonlyArray<{ readonly i: number; readonly path: string }> =
    [
      { i: 0, path: "tasks/a.md" },
      { i: 1, path: "tasks/b.md" },
    ];
  for (const { i, path } of expected) {
    const btn = document.querySelector(
      `[data-testid="links-section-linked-remove-${i}"]`,
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute("data-path")).toBe(path);
    expect(btn?.getAttribute("aria-label")).toBe("リンクを削除");
    expect(btn?.textContent).toBe("×");
  }
});

test("reverse 行には × 削除ボタンが存在しない（reverseLinks は読み取り専用）", () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/r1.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: vi.fn(async () => Result.ok(self)),
    onLinkClick: vi.fn(),
  });

  const reverseRow = document.querySelector(
    '[data-testid="links-section-reverse-0"]',
  );
  expect(reverseRow?.getAttribute("data-path")).toBe("tasks/r1.md");
  // reverse 行には × 削除ボタンが存在しない
  expect(
    reverseRow?.querySelector('button[aria-label="リンクを削除"]'),
  ).toBeNull();
});

test("forward 行は navigate button と × button が独立してクリック可能", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
  });
  const onRemoveLink = vi.fn(async () => Result.ok(self));
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink,
    onLinkClick,
  });

  const navBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  const removeBtn = document.querySelector(
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  expect(navBtn).toBeTruthy();
  expect(removeBtn).toBeTruthy();

  await act(async () => {
    navBtn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(1);
  expect(onLinkClick).toHaveBeenCalledWith("tasks/a.md");
  expect(onRemoveLink).not.toHaveBeenCalled();

  await act(async () => {
    removeBtn.click();
  });
  expect(onRemoveLink).toHaveBeenCalledTimes(1);
  expect(onRemoveLink).toHaveBeenCalledWith("tasks/self.md", "tasks/a.md");
  expect(onLinkClick).toHaveBeenCalledTimes(1);
});

test("forward × クリックで onRemoveLink(sourceFilePath, targetFilePath) が呼ばれる", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
  });
  const onRemoveLink = vi.fn(async () => Result.ok(self));
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
  });

  expect(onRemoveLink).toHaveBeenCalledWith("tasks/self.md", "tasks/a.md");
});

test("onRemoveLink pending 中は forward × button と + button が disabled", async () => {
  let resolveCb: ((r: Result<Task, unknown>) => void) | null = null;
  const onRemoveLink = vi.fn(
    () =>
      new Promise<Result<Task, unknown>>((resolve) => {
        resolveCb = resolve;
      }),
  );
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md", "tasks/b.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink,
  });

  const firstBtn = document.querySelector(
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  act(() => {
    firstBtn.click();
  });

  // 全 forward × ボタンが disabled
  for (const sel of [
    "links-section-linked-remove-0",
    "links-section-linked-remove-1",
  ]) {
    const btn = document.querySelector(
      `[data-testid="${sel}"]`,
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  }
  // + リンク追加ボタンも disabled
  const addBtn = document.querySelector(
    '[data-testid="links-section-add-button"]',
  ) as HTMLButtonElement;
  expect(addBtn.disabled).toBe(true);

  // resolve 後は disabled が解除される
  await act(async () => {
    resolveCb?.(Result.ok(self));
  });

  const firstBtnAfter = document.querySelector(
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  expect(firstBtnAfter.disabled).toBe(false);
});

test("popover が開いた状態で × クリックすると TaskSelect の input と候補ボタンが disabled になる", () => {
  // × クリック中に popover が開いていると候補選択で addLink が並行実行できてしまうため、
  // TaskSelect 側にも disabled が伝播することを検証する。
  let resolveCb: ((r: Result<Task, unknown>) => void) | null = null;
  const onRemoveLink = vi.fn(
    () =>
      new Promise<Result<Task, unknown>>((resolve) => {
        resolveCb = resolve;
      }),
  );
  const candidate = makeTask({ filePath: "tasks/c.md", title: "C" });
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
  });
  render({
    task: self,
    allTasks: [self, candidate],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink,
  });

  // popover を開く
  const addBtn = document.querySelector(
    '[data-testid="links-section-add-button"]',
  ) as HTMLButtonElement;
  act(() => {
    addBtn.click();
  });

  // 開いた状態で × クリックして busy にする
  const removeBtn = document.querySelector(
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  act(() => {
    removeBtn.click();
  });

  // TaskSelect 内の search input と候補ボタンが disabled になっていること
  const input = document.querySelector(
    '[data-testid="links-section-input"]',
  ) as HTMLInputElement;
  expect(input.disabled).toBe(true);
  const option = document.querySelector(
    `[data-testid="links-section-option-${candidate.id}"]`,
  ) as HTMLButtonElement;
  expect(option.disabled).toBe(true);

  // resolve で busy 解除 → disabled も解除される
  act(() => {
    resolveCb?.(Result.ok(self));
  });
});
