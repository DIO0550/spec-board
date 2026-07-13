import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DetailFieldHandlers } from "@/features/detail/hooks/useDetailFieldHandlers";
import { getLabels } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { DetailFields } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return { ...actual, getLabels: vi.fn() };
});
const getLabelsMock = vi.mocked(getLabels);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const testColumns = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

beforeEach(() => {
  getLabelsMock.mockResolvedValue(
    Result.ok({ labels: [{ name: "bug" }, { name: "feat" }], usageCounts: {} }),
  );
});

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
  onLabelsChange: vi.fn(),
  onChangeDraft: vi.fn(),
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

/** getLabels（useLabelList）の非同期解決をフラッシュする。 */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * data-testid の要素をクリックする。
 * @param testId - 対象 testid
 */
const clickTestId = (testId: string) => {
  act(() => {
    (
      document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    ).click();
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
  clickTestId("status-field");
  clickTestId("status-field-option-Done");
  expect(onStatusChange).toHaveBeenCalledWith("Done");
  clickTestId("priority-field");
  clickTestId("priority-field-option-High");
  expect(onPriorityChange).toHaveBeenCalledWith("High");
});

test("Labels の候補トグルで onLabelsChange が呼ばれる", async () => {
  const onLabelsChange = vi.fn();
  render(
    <DetailFields
      task={createTask({ labels: [] })}
      columns={testColumns}
      handlers={createHandlers({ onLabelsChange })}
    >
      <DetailFields.Labels />
    </DetailFields>,
  );
  await flush();
  clickTestId("detail-labels");
  clickTestId("detail-labels-option-bug");
  expect(onLabelsChange).toHaveBeenCalledWith(["bug"]);
});

test("Labels の選択済みトグル解除で onLabelsChange が除外後配列で呼ばれる", async () => {
  const onLabelsChange = vi.fn();
  render(
    <DetailFields
      task={createTask({ labels: ["bug"] })}
      columns={testColumns}
      handlers={createHandlers({ onLabelsChange })}
    >
      <DetailFields.Labels />
    </DetailFields>,
  );
  await flush();
  clickTestId("detail-labels");
  clickTestId("detail-labels-option-bug");
  expect(onLabelsChange).toHaveBeenCalledWith([]);
});

test("Root の外で部品を使うと例外を投げる（誤用検知）", () => {
  expect(() => {
    render(<DetailFields.Labels />);
  }).toThrow();
});
