import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { getLabels } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { DetailScreen } from "..";

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
    Result.ok({
      labels: [{ name: "existing" }, { name: "bug" }, { name: "frontend" }],
      usageCounts: {},
    }),
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
const createTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
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

/** getLabels（useLabelList）の非同期解決をフラッシュする。 */
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
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

test("popover から新規作成で onTaskUpdate({ labels: [..., new] }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  await flush();
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

test("選択済み候補のトグル解除で onTaskUpdate({ labels: [除外結果] }) が呼ばれる", async () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["bug", "frontend"] }),
      onTaskUpdate,
    }),
  );
  await flush();
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

test("既存ラベルと同じ文字列は作成候補を出さない（重複作成不可）", async () => {
  const onTaskUpdate = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t1", labels: ["existing"] }),
      onTaskUpdate,
    }),
  );
  await flush();
  openLabels();
  typeLabelSearch("existing");
  expect(
    document.querySelector('[data-testid="detail-labels-create"]'),
  ).toBeNull();
});
