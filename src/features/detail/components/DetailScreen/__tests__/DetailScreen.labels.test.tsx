import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { DetailScreen } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

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

/**
 * label 入力欄に値を入れて Enter で確定する。
 * @param value - 入力するラベル文字列
 */
const typeLabelAndConfirm = (value: string): void => {
  const addButton = document.querySelector(
    '[data-testid="label-add-button"]',
  ) as HTMLElement;
  act(() => {
    addButton.click();
  });
  const input = document.querySelector(
    '[data-testid="label-input"]',
  ) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
};

test("ラベル追加で onTaskUpdate({ labels: [..., new] }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  typeLabelAndConfirm("new-label");
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["existing", "new-label"],
  });
});

test("ラベル削除で onTaskUpdate({ labels: [除外結果] }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["bug", "frontend"] }),
      onTaskUpdate,
    }),
  );
  const removeButton = document.querySelector(
    '[aria-label="ラベル「bug」を削除"]',
  ) as HTMLElement;
  act(() => {
    removeButton.click();
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", { labels: ["frontend"] });
});

test("既存ラベルと同じ文字列を追加しても onTaskUpdate は呼ばれない", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  typeLabelAndConfirm("existing");
  expect(onTaskUpdate).not.toHaveBeenCalled();
});
