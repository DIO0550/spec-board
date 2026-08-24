import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { Task, type TaskPayload } from "@/types/task";
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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
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

const render = (props: Parameters<typeof TaskSelect>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskSelect, props));
  });
};

test("readOnly && value=null で input は描画されず readonly-empty placeholder のみ表示される", () => {
  render({
    tasks: [makeTask({ id: "t-1", filePath: "tasks/a.md" })],
    value: null,
    onChange: vi.fn(),
    readOnly: true,
  });

  expect(
    document.querySelector('[data-testid="task-select-input"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="task-select-readonly-empty"]'),
  ).toBeTruthy();
});

test("readOnly && value あり → selected 表示で clear ボタンは描画されない", () => {
  const task = makeTask({ id: "t-1", title: "親", filePath: "tasks/a.md" });
  render({
    tasks: [task],
    value: taskFilePathFixture("tasks/a.md"),
    onChange: vi.fn(),
    readOnly: true,
  });

  expect(
    document.querySelector('[data-testid="task-select-selected"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-select-clear"]'),
  ).toBeNull();
});

test("disabled で input と候補 option が disabled になる", () => {
  const task = makeTask({ id: "t-1", title: "A", filePath: "tasks/a.md" });
  render({
    tasks: [task],
    value: null,
    onChange: vi.fn(),
    disabled: true,
    autoFocus: true,
  });

  const input = document.querySelector(
    '[data-testid="task-select-input"]',
  ) as HTMLInputElement;
  expect(input.disabled).toBe(true);

  const option = document.querySelector(
    '[data-testid="task-select-option-t-1"]',
  ) as HTMLButtonElement;
  expect(option.disabled).toBe(true);
});

test("value が tasks 不在でも filePath fallback で selected 表示される", () => {
  render({
    tasks: [],
    value: taskFilePathFixture("tasks/missing.md"),
    onChange: vi.fn(),
  });

  const selected = document.querySelector(
    '[data-testid="task-select-selected"]',
  );
  expect(selected?.textContent).toBe("tasks/missing.md");
});

test("clear ボタンで onChange(null) が呼ばれる", () => {
  const onChange = vi.fn();
  const task = makeTask({ id: "t-1", title: "親", filePath: "tasks/a.md" });
  render({
    tasks: [task],
    value: taskFilePathFixture("tasks/a.md"),
    onChange,
  });

  const clear = document.querySelector(
    '[data-testid="task-select-clear"]',
  ) as HTMLButtonElement;
  act(() => {
    clear.click();
  });

  expect(onChange).toHaveBeenCalledWith(null);
});
