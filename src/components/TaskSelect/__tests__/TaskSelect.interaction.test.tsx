import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { TaskSelect } from "..";

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

const makeTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
  Task.fromPayload({
    id: "t-1",
    title: "候補",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/candidate.md",
    ...overrides,
  });

const TASKS: Task[] = [
  makeTask({ id: "t-1", title: "ログイン修正", filePath: "tasks/login.md" }),
  makeTask({ id: "t-2", title: "検索機能追加", filePath: "tasks/search.md" }),
];

const render = (props: Parameters<typeof TaskSelect>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskSelect, props));
  });
};

const setInputValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

test("既定 testIdPrefix では root が task-select-select になる", () => {
  render({ tasks: TASKS, value: null, onChange: vi.fn() });

  expect(
    document.querySelector('[data-testid="task-select-select"]'),
  ).toBeTruthy();
});

test("候補クリックで onChange が filePath で呼ばれる", () => {
  const onChange = vi.fn();
  render({ tasks: TASKS, value: null, onChange });

  const input = document.querySelector(
    '[data-testid="task-select-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
  const option = document.querySelector(
    '[data-testid="task-select-option-t-2"]',
  ) as HTMLElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });

  expect(onChange).toHaveBeenCalledWith("tasks/search.md");
});

test("クエリで title 部分一致の候補に絞り込まれる", () => {
  render({ tasks: TASKS, value: null, onChange: vi.fn() });

  const input = document.querySelector(
    '[data-testid="task-select-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    setInputValue(input, "検索");
  });

  expect(
    document.querySelector('[data-testid="task-select-option-t-2"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-select-option-t-1"]'),
  ).toBeNull();
});

test("autoFocus でマウント時に input にフォーカスし候補一覧が即表示される", () => {
  render({ tasks: TASKS, value: null, onChange: vi.fn(), autoFocus: true });

  const input = document.querySelector(
    '[data-testid="task-select-input"]',
  ) as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  expect(
    document.querySelector('[data-testid="task-select-list"]'),
  ).toBeTruthy();
});

test("Escape キーで onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("外側 mousedown で onClose が呼ばれ、container 内側 mousedown では呼ばれない", () => {
  const onClose = vi.fn();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  const root = document.querySelector(
    '[data-testid="task-select-select"]',
  ) as HTMLElement;
  act(() => {
    root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(onClose).not.toHaveBeenCalled();

  const outside = document.createElement("div");
  document.body.appendChild(outside);
  act(() => {
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  outside.remove();
});

test("label を渡すと ラベル領域が描画される / 渡さないと描画されない", () => {
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    label: "親タスク",
  });
  expect(document.querySelector("label")?.textContent).toBe("親タスク");

  act(() => {
    root?.unmount();
  });
  container?.remove();

  render({ tasks: TASKS, value: null, onChange: vi.fn() });
  expect(document.querySelector("label")).toBeNull();
});
