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
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  expect(btn.getAttribute("data-path")).toBe("tasks/a.md");
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
    '[data-testid="links-section-reverse-navigate-0"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  expect(btn.getAttribute("data-path")).toBe("tasks/r.md");
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
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  const btnB = document.querySelector(
    '[data-testid="links-section-linked-navigate-1"]',
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
    document.querySelector('[data-testid="links-section-linked-navigate-0"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="links-section-linked-remove-0"]'),
  ).toBeTruthy();

  expect(
    document.querySelector('[data-testid="links-section-reverse-navigate-0"]'),
  ).toBeTruthy();
  // reverse 行には × 削除ボタンが存在しない
  const reverseRow = document.querySelector(
    '[data-testid="links-section-reverse-0"]',
  );
  expect(
    reverseRow?.querySelector('button[aria-label="リンクを削除"]'),
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
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-0"]',
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
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-0"]',
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

test("forward 行の link path に表記揺れ（./prefix）があっても canonical id で onLinkClick が呼ばれる", async () => {
  // frontmatter が `./tasks/target.md` のような verbatim 文字列を持つケース。
  // Task.id は canonical な `tasks/target.md` のため、raw 値で onSelectTask しても
  // selectTaskOutcome が null を返して no-op になる。LinksSection 側で allTasks から
  // 表記揺れを吸収し canonical id を渡すことで正しく遷移できる。
  const target = makeTask({
    filePath: "tasks/target.md",
    title: "Target",
  });
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["./tasks/target.md"],
  });
  const onLinkClick = vi.fn();
  render({
    task: self,
    allTasks: [self, target],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick,
  });

  const btn = document.querySelector(
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  expect(btn).toBeTruthy();
  expect(btn.getAttribute("data-path")).toBe("./tasks/target.md");
  await act(async () => {
    btn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(1);
  expect(onLinkClick).toHaveBeenCalledWith("tasks/target.md");
});

test("壊れたリンク（target が allTasks に居ない）クリックでは raw 値を渡し上流に no-op を委ねる", async () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/missing.md"],
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
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
  });
  expect(onLinkClick).toHaveBeenCalledTimes(1);
  expect(onLinkClick).toHaveBeenCalledWith("tasks/missing.md");
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
    '[data-testid="links-section-linked-remove-0"]',
  ) as HTMLButtonElement;
  act(() => {
    removeBtn.click();
  });

  // busy 中: × button は disabled だが navigate button は有効
  expect(removeBtn.disabled).toBe(true);
  const navBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  expect(navBtn.disabled).toBe(false);
  const reverseNavBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-0"]',
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
