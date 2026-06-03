import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { Task, type TaskPayload } from "@/types/task";
import { DetailFields } from "..";

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
 * テスト用の編集ハンドラ群を生成する。
 * @param overrides - 上書きするハンドラ
 * @returns DetailFieldHandlers
 */
const createHandlers = (
  overrides: Partial<DetailFieldHandlers> = {},
): DetailFieldHandlers => ({
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onLabelAdd: vi.fn(),
  onLabelRemove: vi.fn(),
  ...overrides,
});

/**
 * 任意の React 要素をレンダリングするヘルパー
 * @param node - レンダリング対象
 */
function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
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

test("StatusPriority の変更で onStatusChange / onPriorityChange が呼ばれる", () => {
  const onStatusChange = vi.fn();
  const onPriorityChange = vi.fn();
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers({ onStatusChange, onPriorityChange })}
    >
      <DetailFields.StatusPriority />
    </DetailFields>,
  );
  changeSelect(
    document.querySelector(
      '[data-testid="status-select"]',
    ) as HTMLSelectElement,
    "Done",
  );
  expect(onStatusChange).toHaveBeenCalledWith("Done");
  changeSelect(
    document.querySelector(
      '[data-testid="priority-select"]',
    ) as HTMLSelectElement,
    "High",
  );
  expect(onPriorityChange).toHaveBeenCalledWith("High");
});

test("Labels の追加で onLabelAdd が呼ばれる", () => {
  const onLabelAdd = vi.fn();
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers({ onLabelAdd })}
    >
      <DetailFields.Labels />
    </DetailFields>,
  );
  act(() => {
    (
      document.querySelector('[data-testid="label-add-button"]') as HTMLElement
    ).click();
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

test("Labels の削除で onLabelRemove が呼ばれる", () => {
  const onLabelRemove = vi.fn();
  render(
    <DetailFields
      task={createTask({ labels: ["bug"] })}
      columns={testColumns}
      handlers={createHandlers({ onLabelRemove })}
    >
      <DetailFields.Labels />
    </DetailFields>,
  );
  act(() => {
    (
      document.querySelector(
        '[aria-label="ラベル「bug」を削除"]',
      ) as HTMLElement
    ).click();
  });
  expect(onLabelRemove).toHaveBeenCalledWith("bug");
});

test("Root の外で部品を使うと例外を投げる（誤用検知）", () => {
  expect(() => {
    render(<DetailFields.Labels />);
  }).toThrow();
});
