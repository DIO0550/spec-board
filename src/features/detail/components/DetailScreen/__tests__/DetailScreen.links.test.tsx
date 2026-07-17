import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { Result } from "@/utils/result";
import { DetailScreen } from "..";

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
const createTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "task-1",
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

/**
 * DetailScreen の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailScreen の props
 */
const buildProps = (
  overrides: Partial<Parameters<typeof DetailScreen>[0]> = {},
): Parameters<typeof DetailScreen>[0] => ({
  task: overrides.task ?? createTask(),
  columns: testColumns,
  onBack: vi.fn(),
  onTaskUpdate: vi.fn(),
  onDelete: vi.fn(),
  ...overrides,
});

/**
 * DetailScreen をレンダリングするヘルパー
 * @param props - DetailScreen に渡す props
 */
const render = (props: Parameters<typeof DetailScreen>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailScreen, props));
  });
};

test("onAddLink と allTasks の両方が指定されているときに LinksSection が描画される", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render(
    buildProps({
      task,
      allTasks: [task],
      onAddLink: vi.fn(async () => Result.ok(task)),
    }),
  );
  expect(document.querySelector('[data-testid="links-section"]')).toBeTruthy();
});

test("onAddLink が undefined だと LinksSection は描画されない", () => {
  const task = createTask({ filePath: "tasks/a.md" });
  render(buildProps({ task, allTasks: [task] }));
  expect(document.querySelector('[data-testid="links-section"]')).toBeNull();
});

test("LinksSection の候補選択で onAddLink が source/target 付きで呼ばれる", async () => {
  const self = createTask({ filePath: "tasks/self.md" });
  const candidate = createTask({ filePath: "tasks/c.md", title: "C" });
  const onAddLink = vi.fn(async () => Result.ok(self));
  render(buildProps({ task: self, allTasks: [self, candidate], onAddLink }));
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
});

test("onSelectTask を渡すと LinksSection links 行 click で呼ばれる", async () => {
  const self = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/linked.md"],
  });
  const linked = createTask({ filePath: "tasks/linked.md", title: "Linked" });
  const onSelectTask = vi.fn();
  render(
    buildProps({
      task: self,
      allTasks: [self, linked],
      onAddLink: vi.fn(async () => Result.ok(self)),
      onSelectTask,
    }),
  );
  const btn = document.querySelector(
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  expect(btn.getAttribute("data-path")).toBe("tasks/linked.md");
  await act(async () => {
    btn.click();
  });
  expect(onSelectTask).toHaveBeenCalledWith("tasks/linked.md");
});

test("onSelectTask を渡さない場合、LinksSection の navigate button は disabled", () => {
  const self = createTask({
    filePath: "tasks/self.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/r.md"],
  });
  render(
    buildProps({
      task: self,
      allTasks: [self],
      onAddLink: vi.fn(async () => Result.ok(self)),
    }),
  );
  const forwardBtn = document.querySelector(
    '[data-testid="links-section-linked-navigate-0"]',
  ) as HTMLButtonElement;
  const reverseBtn = document.querySelector(
    '[data-testid="links-section-reverse-navigate-0"]',
  ) as HTMLButtonElement;
  expect(forwardBtn.disabled).toBe(true);
  expect(reverseBtn.disabled).toBe(true);
});
