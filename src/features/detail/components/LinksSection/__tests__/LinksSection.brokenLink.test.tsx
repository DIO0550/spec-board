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

test("brokenLinkPaths に含まれる linked 行に WarningIcon と『リンク切れ』が表示される", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/dead.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
    brokenLinkPaths: new Set(["tasks/dead.md"]),
  });
  const row = document.querySelector('[data-testid="links-section-linked-0"]');
  expect(row?.getAttribute("data-broken")).toBe("true");
  expect(row?.getAttribute("data-path")).toBe("tasks/dead.md");
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
  expect(row?.textContent).toContain("リンク切れ");
});

test("brokenLinkPaths に含まれない linked 行は WarningIcon が出ない", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/alive.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
    brokenLinkPaths: new Set(),
  });
  const row = document.querySelector(
    '[data-testid="links-section-linked-tasks/alive.md"]',
  );
  expect(row?.getAttribute("data-broken")).toBeNull();
  expect(row?.querySelector('[data-testid="warning-icon"]')).toBeNull();
});

test("brokenReverseLinkPaths に含まれる reverse 行にも WarningIcon と『リンク切れ』が出る", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/gone.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
    brokenReverseLinkPaths: new Set(["tasks/gone.md"]),
  });
  const row = document.querySelector(
    '[data-testid="links-section-reverse-tasks/gone.md"]',
  );
  expect(row?.getAttribute("data-broken")).toBe("true");
  expect(row?.querySelector('[data-testid="warning-icon"]')).not.toBeNull();
  expect(row?.textContent).toContain("リンク切れ");
});

test("brokenReverseLinkPaths に含まれない reverse 行は WarningIcon が出ない", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/alive.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
  });
  const row = document.querySelector(
    '[data-testid="links-section-reverse-tasks/alive.md"]',
  );
  expect(row?.querySelector('[data-testid="warning-icon"]')).toBeNull();
});

test("リンク切れ path は取消線スタイル (line-through) で表示される", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/dead.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
    brokenLinkPaths: new Set(["tasks/dead.md"]),
  });
  const struck = document.querySelector(
    '[data-testid="links-section-linked-broken-0"]',
  );
  expect(struck?.getAttribute("class")).toContain("line-through");
});

test("brokenLinkPaths 未指定でも既存の linked 行は表示される（後方互換）", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/alive.md"],
  });
  render({
    task,
    allTasks: [task],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopOnAddLink,
    onRemoveLink: noopOnRemoveLink,
    onLinkClick: vi.fn(),
  });
  expect(
    document.querySelector(
      '[data-testid="links-section-linked-tasks/alive.md"]',
    ),
  ).not.toBeNull();
});
