import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { DetailFields } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
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
function createTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
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
 * @returns DetailFieldHandlers
 */
const createHandlers = (): DetailFieldHandlers => ({
  onStatusChange: vi.fn(),
  onPriorityChange: vi.fn(),
  onLabelsChange: vi.fn(),
  onChangeDraft: vi.fn(),
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

test("draft タスクの詳細では「下書き」バッジと「下書きを解除」ボタンが表示される", () => {
  render(
    <DetailFields
      task={createTask({ draft: true })}
      columns={testColumns}
      handlers={createHandlers()}
    >
      <DetailFields.Draft />
    </DetailFields>,
  );
  expect(
    container?.querySelector('[data-testid="detail-draft-badge"]')?.textContent,
  ).toBe("下書き");
  expect(
    container?.querySelector('[data-testid="detail-draft-clear"]')?.textContent,
  ).toBe("下書きを解除");
});

test("通常タスクの詳細では draft フィールド自体が表示されない", () => {
  render(
    <DetailFields
      task={createTask()}
      columns={testColumns}
      handlers={createHandlers()}
    >
      <DetailFields.Draft />
    </DetailFields>,
  );
  expect(
    container?.querySelector('[data-testid="detail-draft-field"]'),
  ).toBeNull();
});

test("「下書きを解除」クリックで onChangeDraft(false) が 1 回呼ばれる", () => {
  const handlers = createHandlers();
  render(
    <DetailFields
      task={createTask({ draft: true })}
      columns={testColumns}
      handlers={handlers}
    >
      <DetailFields.Draft />
    </DetailFields>,
  );
  const button = container?.querySelector(
    '[data-testid="detail-draft-clear"]',
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
  expect(handlers.onChangeDraft).toHaveBeenCalledTimes(1);
  expect(handlers.onChangeDraft).toHaveBeenCalledWith(false);
});
