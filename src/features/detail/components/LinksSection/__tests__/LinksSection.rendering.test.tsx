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

test("linkedFilePaths が一覧表示される", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/linked-1.md", "tasks/linked-2.md"],
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
      '[data-testid="links-section-linked-tasks/linked-1.md"]',
    ),
  ).toBeTruthy();
  expect(
    document.querySelector(
      '[data-testid="links-section-linked-tasks/linked-2.md"]',
    ),
  ).toBeTruthy();
});

test("reverseLinkedFilePaths が区別された testid で表示される", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/r-1.md"],
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
      '[data-testid="links-section-reverse-tasks/r-1.md"]',
    ),
  ).toBeTruthy();
});

test("reverse 行に × 削除ボタンが存在しない", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    reverseLinks: ["tasks/r-1.md"],
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
      '[data-testid="links-section-reverse-remove-tasks/r-1.md"]',
    ),
  ).toBeNull();
});

test("linked <ul> が reverse <ul> より DOM 上で先に出現する", () => {
  const task = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/linked-1.md"],
    reverseLinks: ["tasks/r-1.md"],
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

  const linkedUl = document.querySelector(
    '[data-testid="links-section-linked"]',
  );
  const reverseUl = document.querySelector(
    '[data-testid="links-section-reverse"]',
  );
  const position = linkedUl?.compareDocumentPosition(reverseUl as Node) ?? 0;
  expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("初期状態では `+ リンク追加` ボタンが表示され popover は閉じている", () => {
  const task = makeTask({ filePath: "tasks/self.md" });
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
    document.querySelector('[data-testid="links-section-add-button"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeNull();
});
