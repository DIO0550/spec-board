import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { createDetailWrapper } from "../../DetailProvider/wrapper";
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
  const Wrapper = createDetailWrapper({
    task: createTask({ draft: true }),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Draft />
      </DetailFields>
    </Wrapper>,
  );
  expect(
    container?.querySelector('[data-testid="detail-draft-badge"]')?.textContent,
  ).toBe("下書き");
  expect(
    container?.querySelector('[data-testid="detail-draft-clear"]')?.textContent,
  ).toBe("下書きを解除");
});

test("通常タスクの詳細では draft フィールド自体が表示されない", () => {
  const Wrapper = createDetailWrapper({
    task: createTask(),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Draft />
      </DetailFields>
    </Wrapper>,
  );
  expect(
    container?.querySelector('[data-testid="detail-draft-field"]'),
  ).toBeNull();
});

test("「下書きを解除」クリックで onTaskUpdate(task.id, { draft: false }) が 1 回呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const Wrapper = createDetailWrapper({
    task: createTask({ draft: true }),
    columns: testColumns,
    onTaskUpdate,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Draft />
      </DetailFields>
    </Wrapper>,
  );
  const button = container?.querySelector(
    '[data-testid="detail-draft-clear"]',
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
  expect(onTaskUpdate).toHaveBeenCalledTimes(1);
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { draft: false });
});
