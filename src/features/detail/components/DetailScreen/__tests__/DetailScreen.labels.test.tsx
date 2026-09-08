import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { LabelDefinition } from "@/domains/label-definition";
import { TaskProjection } from "@/domains/task-projection";
import { Task, type TaskPayload } from "@/types/task";
import { DetailScreen } from "..";

/** ラベル候補は App の唯一の取得点（useLabels）由来のため、テストでは prop で供給する。 */
const LABEL_SUGGESTIONS = LabelDefinition.listFromWire([
  { name: "existing" },
  { name: "bug" },
  { name: "frontend" },
]);

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
  projections: TaskProjection.emptyMap,
  labelSuggestions: LABEL_SUGGESTIONS,
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

/** ラベル popover を開く。 */
const openLabels = () => {
  act(() => {
    (
      document.querySelector('[data-testid="detail-labels"]') as HTMLElement
    ).click();
  });
};

/**
 * ラベル検索欄に値を入れる。
 * @param value - 入力する文字列
 */
const typeLabelSearch = (value: string): void => {
  const input = document.querySelector(
    '[data-testid="detail-labels-search"]',
  ) as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

test("popover から新規作成で onTaskUpdate({ labels: [..., new] }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  openLabels();
  typeLabelSearch("new-label");
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-labels-create"]',
      ) as HTMLElement
    ).click();
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["existing", "new-label"],
  });
});

test("選択済み候補のトグル解除で onTaskUpdate({ labels: [除外結果] }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["bug", "frontend"] }),
      onTaskUpdate,
    }),
  );
  openLabels();
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-labels-option-bug"]',
      ) as HTMLElement
    ).click();
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", { labels: ["frontend"] });
});

test("既存ラベルと同じ文字列は作成候補を出さない（重複作成不可）", () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  openLabels();
  typeLabelSearch("existing");
  expect(
    document.querySelector('[data-testid="detail-labels-create"]'),
  ).toBeNull();
});

test("labelSuggestions が空配列でも新規ラベルを作成できる", () => {
  // 取得失敗・未オープンを App の useLabels が labels: [] に潰した状態が詳細側へ届くケース。
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: [] }),
      labelSuggestions: [],
      onTaskUpdate,
    }),
  );
  openLabels();
  expect(
    document.querySelector('[data-testid^="detail-labels-option-"]'),
  ).toBeNull();
  typeLabelSearch("new-label");
  act(() => {
    (
      document.querySelector(
        '[data-testid="detail-labels-create"]',
      ) as HTMLElement
    ).click();
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", { labels: ["new-label"] });
});
