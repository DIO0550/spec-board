import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { BrokenLinkSet } from "@/domains/broken-link";
import { Task, type TaskPayload } from "@/types/task";
import { DetailFields } from "..";

/** リンク切れなしの BrokenLinkSet */
const noBrokenLinks: BrokenLinkSet = {
  parent: false,
  links: new Set<string>(),
  children: new Set<string>(),
  reverseLinks: new Set<string>(),
};

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
function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "本文",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * DetailFields の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailFields の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailFields>[0]> = {},
): Parameters<typeof DetailFields>[0] {
  const task = overrides.task ?? createTask();
  return {
    task,
    columns: testColumns,
    childTasks: [],
    descendantTasks: [],
    effectiveDoneColumn: "Done",
    parentTask: null,
    brokenLinks: noBrokenLinks,
    onStatusChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onLabelAdd: vi.fn(),
    onLabelRemove: vi.fn(),
    ...overrides,
  };
}

/**
 * DetailFields をレンダリングするヘルパー
 * @param props - DetailFields に渡す props
 */
function render(props: Parameters<typeof DetailFields>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailFields, props));
  });
}

/**
 * select 要素の value を変更し change を発火する。
 * @param select - 対象 select
 * @param value - 設定する value
 */
const changeSelect = (select: HTMLSelectElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

test("StatusSelect 変更で onStatusChange が呼ばれる", () => {
  const onStatusChange = vi.fn();
  render(buildProps({ onStatusChange }));
  const select = document.querySelector(
    '[data-testid="status-select"]',
  ) as HTMLSelectElement;
  changeSelect(select, "Done");
  expect(onStatusChange).toHaveBeenCalledWith("Done");
});

test("PrioritySelect 変更で onPriorityChange が呼ばれる", () => {
  const onPriorityChange = vi.fn();
  render(buildProps({ onPriorityChange }));
  const select = document.querySelector(
    '[data-testid="priority-select"]',
  ) as HTMLSelectElement;
  changeSelect(select, "High");
  expect(onPriorityChange).toHaveBeenCalledWith("High");
});

test("LabelEditor で追加すると onLabelAdd が呼ばれる", () => {
  const onLabelAdd = vi.fn();
  render(buildProps({ onLabelAdd }));
  const addButton = document.querySelector(
    '[data-testid="label-add-button"]',
  ) as HTMLElement;
  act(() => {
    addButton.click();
  });
  const input = document.querySelector(
    '[data-testid="label-input"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, "bug");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onLabelAdd).toHaveBeenCalledWith("bug");
});

test("LabelEditor で削除すると onLabelRemove が呼ばれる", () => {
  const onLabelRemove = vi.fn();
  render(buildProps({ task: createTask({ labels: ["bug"] }), onLabelRemove }));
  const removeButton = document.querySelector(
    '[aria-label="ラベル「bug」を削除"]',
  ) as HTMLElement;
  act(() => {
    removeButton.click();
  });
  expect(onLabelRemove).toHaveBeenCalledWith("bug");
});
