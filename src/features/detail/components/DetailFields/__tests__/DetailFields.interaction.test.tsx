import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LabelDefinition } from "@/domains/label-definition";
import { createDetailWrapper } from "@/features/detail/providers/DetailProvider/wrapper";
import { getLabels } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
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
  getLabelsMock.mockReset();
});

/** ラベル候補は App の唯一の取得点（useLabels）由来のため、テストでは Provider に供給する。 */
const LABEL_SUGGESTIONS = LabelDefinition.listFromWire([
  { name: "bug" },
  { name: "feat" },
]);

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

test("StatusPriority の変更で onTaskUpdate が status / priority で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const Wrapper = createDetailWrapper({
    task: createTask(),
    columns: testColumns,
    onTaskUpdate,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.StatusPriority />
      </DetailFields>
    </Wrapper>,
  );
  clickTestId("status-field");
  clickTestId("status-field-option-Done");
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { status: "Done" });
  clickTestId("priority-field");
  clickTestId("priority-field-option-High");
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { priority: "High" });
});

test("Labels の候補トグルで onTaskUpdate が labels で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const Wrapper = createDetailWrapper({
    task: createTask({ labels: [] }),
    columns: testColumns,
    onTaskUpdate,
    labelSuggestions: LABEL_SUGGESTIONS,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  clickTestId("detail-labels");
  clickTestId("detail-labels-option-bug");
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { labels: ["bug"] });
});

test("Labels の選択済みトグル解除で onTaskUpdate が除外後配列で呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const Wrapper = createDetailWrapper({
    task: createTask({ labels: ["bug"] }),
    columns: testColumns,
    onTaskUpdate,
    labelSuggestions: LABEL_SUGGESTIONS,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  clickTestId("detail-labels");
  clickTestId("detail-labels-option-bug");
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { labels: [] });
});

test("labelSuggestions 未指定でもラベル欄が描画され候補は 0 件になる", () => {
  const Wrapper = createDetailWrapper({
    task: createTask({ labels: [] }),
    columns: testColumns,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  clickTestId("detail-labels");
  expect(
    document.querySelector('[data-testid^="detail-labels-option-"]'),
  ).toBeNull();
});

test("DetailFields はラベル候補を自前で取得しない（getLabels を呼ばない）", async () => {
  const Wrapper = createDetailWrapper({
    task: createTask({ labels: [] }),
    columns: testColumns,
    labelSuggestions: LABEL_SUGGESTIONS,
  });
  render(
    <Wrapper>
      <DetailFields>
        <DetailFields.Labels />
      </DetailFields>
    </Wrapper>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(getLabelsMock).not.toHaveBeenCalled();
});

test("DetailProvider の外で部品を使うと例外を投げる（誤用検知）", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    render(<DetailFields.Labels />);
  }).toThrow(/DetailProvider/);
  consoleSpy.mockRestore();
});
