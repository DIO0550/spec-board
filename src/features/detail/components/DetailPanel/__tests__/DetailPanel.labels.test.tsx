import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { DetailPanel } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/** テスト用カラム一覧 */
const testColumns = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

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
const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "タスクの本文",
    filePath: "tasks/test.md",
    ...overrides,
  });

/**
 * DetailPanel をレンダリングするヘルパー
 * @param props - DetailPanel に渡す props
 */
const render = (props: Parameters<typeof DetailPanel>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailPanel, props));
  });
};

test("ラベル追加で onTaskUpdate({ labels: [..., new] }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "t1", labels: ["existing"] }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="label-add-button"]'),
    ).toBeTruthy();
  });
  const addButton = document.querySelector(
    '[data-testid="label-add-button"]',
  ) as HTMLElement;
  act(() => {
    addButton.click();
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
  });
  const input = document.querySelector(
    '[data-testid="label-input"]',
  ) as HTMLInputElement;
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, "new-label");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["existing", "new-label"],
  });
});

test("ラベル削除で onTaskUpdate({ labels: [除外結果] }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "t1", labels: ["bug", "frontend"] }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[aria-label="ラベル「bug」を削除"]'),
    ).toBeTruthy();
  });
  const removeButton = document.querySelector(
    '[aria-label="ラベル「bug」を削除"]',
  ) as HTMLElement;
  act(() => {
    removeButton.click();
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["frontend"],
  });
});

test("既存ラベルと同じ文字列を追加しても onTaskUpdate は呼ばれない", async () => {
  const onTaskUpdate = vi.fn();
  render({
    task: createTask({ id: "t1", labels: ["existing"] }),
    columns: testColumns,
    onClose: vi.fn(),
    onTaskUpdate,
    onDelete: vi.fn(),
  });
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="label-add-button"]'),
    ).toBeTruthy();
  });
  const addButton = document.querySelector(
    '[data-testid="label-add-button"]',
  ) as HTMLElement;
  act(() => {
    addButton.click();
  });
  await vi.waitFor(() => {
    expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
  });
  const input = document.querySelector(
    '[data-testid="label-input"]',
  ) as HTMLInputElement;
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, "existing");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onTaskUpdate).not.toHaveBeenCalled();
});
