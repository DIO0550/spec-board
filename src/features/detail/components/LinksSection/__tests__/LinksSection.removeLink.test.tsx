import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
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
 * @param overrides TaskPayload の上書き値
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
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

  for (const p of ["tasks/a.md", "tasks/b.md"]) {
    const btn = document.querySelector(
      `[data-testid="links-section-linked-remove-${p}"]`,
    ) as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute("aria-label")).toBe("リンクを削除");
    expect(btn?.textContent).toBe("×");
  }
});

test("reverse リンクの各 li にも × ボタンが表示される", () => {
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
  });

  const btn = document.querySelector(
    '[data-testid="links-section-reverse-remove-tasks/r1.md"]',
  ) as HTMLButtonElement | null;
  expect(btn).toBeTruthy();
  expect(btn?.getAttribute("aria-label")).toBe("リンクを削除");
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
    '[data-testid="links-section-linked-remove-tasks/a.md"]',
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
  });

  expect(onRemoveLink).toHaveBeenCalledWith("tasks/self.md", "tasks/a.md");
});

test("reverse × クリックで onRemoveLink(相手, 表示中タスク) で source/target が反転する", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/other.md"],
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
    '[data-testid="links-section-reverse-remove-tasks/other.md"]',
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
  });

  expect(onRemoveLink).toHaveBeenCalledWith("tasks/other.md", "tasks/self.md");
});

test("onRemoveLink pending 中は section 内の全 × button と + button が disabled", async () => {
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
    reverseLinks: ["tasks/r.md"],
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
    '[data-testid="links-section-linked-remove-tasks/a.md"]',
  ) as HTMLButtonElement;
  act(() => {
    firstBtn.click();
  });

  // 全 × ボタンが disabled
  for (const sel of [
    "links-section-linked-remove-tasks/a.md",
    "links-section-linked-remove-tasks/b.md",
    "links-section-reverse-remove-tasks/r.md",
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
    '[data-testid="links-section-linked-remove-tasks/a.md"]',
  ) as HTMLButtonElement;
  expect(firstBtnAfter.disabled).toBe(false);
});
