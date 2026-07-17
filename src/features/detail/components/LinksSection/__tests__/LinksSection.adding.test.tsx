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

const Wrapper = (
  props: Parameters<typeof LinksSection>[0] & { taskKey?: string },
) => {
  const { taskKey, ...rest } = props;
  return createElement(LinksSection, { ...rest, key: taskKey });
};

const renderWrapped = (
  props: Parameters<typeof LinksSection>[0] & { taskKey?: string },
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Wrapper, props));
  });
};

const noopOnRemoveLink = vi.fn(async () =>
  Result.ok(makeTask({ filePath: "tasks/x.md" })),
);

test("+ ボタン押下で TaskSelect popover が表示される", () => {
  const self = makeTask({ filePath: "tasks/self.md" });
  const candidate = makeTask({ filePath: "tasks/c1.md", title: "C1" });
  const onAddLink = vi.fn(async () => Result.ok(self));
  render({
    task: self,
    allTasks: [self, candidate],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink,
    onRemoveLink: noopOnRemoveLink,
  });

  const addButton = document.querySelector(
    '[data-testid="links-section-add-button"]',
  ) as HTMLButtonElement;
  act(() => {
    addButton.click();
  });

  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeTruthy();
});

test("popover の候補に self / linked / reverseLinked / parent / children は含まれない", () => {
  const self = makeTask({
    filePath: "tasks/self.md",
    links: ["tasks/linked.md"],
    reverseLinks: ["tasks/reverse.md"],
  });
  const linked = makeTask({ filePath: "tasks/linked.md" });
  const reverse = makeTask({ filePath: "tasks/reverse.md" });
  const parent = makeTask({ filePath: "tasks/parent.md", title: "Parent" });
  const child = makeTask({ filePath: "tasks/child.md", title: "Child" });
  const other = makeTask({ filePath: "tasks/other.md", title: "Other" });
  render({
    task: self,
    allTasks: [self, linked, reverse, parent, child, other],
    parentFilePath: "tasks/parent.md",
    childrenFilePaths: ["tasks/child.md"],
    onAddLink: vi.fn(async () => Result.ok(self)),
    onRemoveLink: noopOnRemoveLink,
  });

  act(() => {
    (
      document.querySelector(
        '[data-testid="links-section-add-button"]',
      ) as HTMLButtonElement
    ).click();
  });

  // candidate は other のみ
  expect(
    document.querySelector(`[data-testid="links-section-option-${other.id}"]`),
  ).toBeTruthy();
  for (const t of [self, linked, reverse, parent, child]) {
    expect(
      document.querySelector(`[data-testid="links-section-option-${t.id}"]`),
    ).toBeNull();
  }
});

test("候補選択で onAddLink が source/target で呼ばれ popover が閉じる", async () => {
  const self = makeTask({ filePath: "tasks/self.md" });
  const candidate = makeTask({ filePath: "tasks/c.md", title: "C" });
  const onAddLink = vi.fn(async () => Result.ok(self));
  render({
    task: self,
    allTasks: [self, candidate],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink,
    onRemoveLink: noopOnRemoveLink,
  });

  act(() => {
    (
      document.querySelector(
        '[data-testid="links-section-add-button"]',
      ) as HTMLButtonElement
    ).click();
  });

  const option = document.querySelector(
    `[data-testid="links-section-option-${candidate.id}"]`,
  ) as HTMLButtonElement;
  await act(async () => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });

  expect(onAddLink).toHaveBeenCalledWith("tasks/self.md", "tasks/c.md");
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeNull();
});

test("task 切替（key 変化）で popover が閉じる（リマウント挙動）", () => {
  const taskA = makeTask({ filePath: "tasks/a.md" });
  const taskB = makeTask({ filePath: "tasks/b.md" });
  const props = {
    task: taskA,
    allTasks: [taskA, taskB],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: vi.fn(async () => Result.ok(taskA)),
    onRemoveLink: noopOnRemoveLink,
  };
  renderWrapped({ ...props, taskKey: taskA.id });

  act(() => {
    (
      document.querySelector(
        '[data-testid="links-section-add-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeTruthy();

  // 別 task に key 差し替えてリマウント
  act(() => {
    root?.render(
      createElement(Wrapper, {
        ...props,
        task: taskB,
        taskKey: taskB.id,
      }),
    );
  });
  expect(
    document.querySelector('[data-testid="links-section-select"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="links-section-add-button"]'),
  ).toBeTruthy();
});
