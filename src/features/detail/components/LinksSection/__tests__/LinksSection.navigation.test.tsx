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
const noopOnRemoveLink = vi.fn(async () =>
  Result.ok(makeTask({ filePath: "tasks/x.md" })),
);

test("forward 行 button クリックで onLinkClick(filePath) が呼ばれる", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
  });
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/a.md"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  await act(async () => {
    btn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(1);
  expect(onLinkClick).toHaveBeenCalledWith("tasks/a.md");
});

test("reverse 行 button クリックで onLinkClick(filePath) が呼ばれる", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/r.md"],
  });
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/r.md"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  await act(async () => {
    btn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(1);
  expect(onLinkClick).toHaveBeenCalledWith("tasks/r.md");
});

test("複数 forward links がある場合、それぞれの navigate button が独立に動作する", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md", "tasks/b.md"],
  });
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick,
  });

  const btnA = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/a.md"]',
  ) as HTMLButtonElement;
  const btnB = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/b.md"]',
  ) as HTMLButtonElement;
  await act(async () => {
    btnA.click();
  });
  await act(async () => {
    btnB.click();
  });
  expect(onLinkClick).toHaveBeenNthCalledWith(1, "tasks/a.md");
  expect(onLinkClick).toHaveBeenNthCalledWith(2, "tasks/b.md");
});

test("forward 行は navigate button と × button の 2 つを持ち、reverse 行は navigate button のみ", () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
  });

  expect(
    document.querySelector(
      '[data-testid="links-section-linked-navigate-tasks/a.md"]',
    ),
  ).toBeTruthy();
  expect(
    document.querySelector(
      '[data-testid="links-section-linked-remove-tasks/a.md"]',
    ),
  ).toBeTruthy();

  expect(
    document.querySelector(
      '[data-testid="links-section-reverse-navigate-tasks/r.md"]',
    ),
  ).toBeTruthy();
  expect(
    document.querySelector(
      '[data-testid="links-section-reverse-remove-tasks/r.md"]',
    ),
  ).toBeNull();
});

test("linked <ul> が reverse <ul> より DOM 上で先に出現する", () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
  });

  const linkedUl = document.querySelector(
    '[data-testid="links-section-linked"]',
  );
  const reverseUl = document.querySelector(
    '[data-testid="links-section-reverse"]',
  );
  expect(linkedUl).toBeTruthy();
  expect(reverseUl).toBeTruthy();
  const position = linkedUl?.compareDocumentPosition(reverseUl as Node) ?? 0;
  expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("同一 ID が linked と reverse 両方にある場合、両方の行が表示され両方クリック可能", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/dup.md"],
    reverseLinks: ["tasks/dup.md"],
  });
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick,
  });

  const forwardBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/dup.md"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/dup.md"]',
  ) as HTMLButtonElement;
  expect(forwardBtn).toBeTruthy();
  expect(reverseBtn).toBeTruthy();

  await act(async () => {
    forwardBtn.click();
  });
  await act(async () => {
    reverseBtn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(2);
  expect(onLinkClick).toHaveBeenNthCalledWith(1, "tasks/dup.md");
  expect(onLinkClick).toHaveBeenNthCalledWith(2, "tasks/dup.md");
});

test("onLinkClick 未指定時、navigate button は disabled になり click しても呼ばれない", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
  render({
    task: self,
    allTasks: [self],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
  });

  const forwardBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/a.md"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/r.md"]',
  ) as HTMLButtonElement;
  expect(forwardBtn.disabled).toBe(true);
  expect(reverseBtn.disabled).toBe(true);

  await act(async () => {
    forwardBtn.click();
    reverseBtn.click();
  });
  // disabled button の click は no-op（onLinkClick 未指定なので副作用は観察できない）
  expect(forwardBtn.disabled).toBe(true);
});

test("forward × クリック直後の busy 状態でも navigate button は disabled にならず click 可能", async () => {
  let resolveCb: ((r: Result<Task, unknown>) => void) | null = null;
  const onRemoveLink = vi.fn(
    () =>
      new Promise<Result<Task, unknown>>((resolve) => {
        resolveCb = resolve;
      }),
  );
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
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

  const removeBtn = document.querySelector(
    '[data-testid="links-section-linked-remove-tasks/a.md"]',
  ) as HTMLButtonElement;
  act(() => {
    removeBtn.click();
  });

  // busy 中: × button は disabled だが navigate button は有効
  expect(removeBtn.disabled).toBe(true);
  const navBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-tasks/a.md"]',
  ) as HTMLButtonElement;
  expect(navBtn.disabled).toBe(false);
  const reverseNavBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-tasks/r.md"]',
  ) as HTMLButtonElement;
  expect(reverseNavBtn.disabled).toBe(false);

  await act(async () => {
    navBtn.click();
  });
  expect(onLinkClick).toHaveBeenCalledWith("tasks/a.md");

  // 後片付け
  await act(async () => {
    resolveCb?.(Result.ok(self));
  });
});
