import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
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
function createTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
  return Task.fromPayload({
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
}

/**
 * DetailScreen の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns DetailScreen の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof DetailScreen>[0]> = {},
): Parameters<typeof DetailScreen>[0] {
  return {
    task: overrides.task ?? createTask(),
    columns: testColumns,
    onBack: vi.fn(),
    onTaskUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

/**
 * DetailScreen をレンダリングするヘルパー
 * @param props - DetailScreen に渡す props
 */
function render(props: Parameters<typeof DetailScreen>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(DetailScreen, props));
  });
}

/**
 * 指定 testid の要素を click する。
 * @param testId - data-testid
 */
const click = (testId: string): void => {
  act(() => {
    (
      document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    ).click();
  });
};

test("「削除」ボタンクリックで確認ダイアログが表示される", () => {
  render(buildProps());
  click("detail-delete-button");
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
});

test("子なしタスク: 確定で onDelete が引数 1 つで呼ばれる", () => {
  const onDelete = vi.fn();
  render(
    buildProps({ task: createTask({ id: "task-no-children" }), onDelete }),
  );
  click("detail-delete-button");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["task-no-children"]);
});

test("子ありタスク: 確認ダイアログに orphan-strategy ラジオグループが表示される", () => {
  render(buildProps({ task: createTask({ children: ["child-1.md"] }) }));
  click("detail-delete-button");
  expect(
    document.querySelector('[data-testid="delete-orphan-strategy-radiogroup"]'),
  ).toBeTruthy();
});

test("子なしタスク: 確認ダイアログに orphan-strategy ラジオグループが表示されない", () => {
  render(buildProps({ task: createTask({ children: [] }) }));
  click("detail-delete-button");
  expect(
    document.querySelector('[data-testid="delete-orphan-strategy-radiogroup"]'),
  ).toBeNull();
});

test("子ありタスク: message に子タスク件数が含まれる", () => {
  render(buildProps({ task: createTask({ children: ["a.md", "b.md"] }) }));
  click("detail-delete-button");
  const dialog = document.querySelector('[data-testid="confirm-dialog"]');
  expect(dialog?.textContent).toContain("子タスクが 2 件あります");
});

test("子ありタスク: clear のまま確定で onDelete(id, 'clear')", () => {
  const onDelete = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "task-with-children", children: ["a.md"] }),
      onDelete,
    }),
  );
  click("detail-delete-button");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["task-with-children", "clear"]);
});

test("子ありタスク: abort に切替後の確定で onDelete(id, 'abort')", () => {
  const onDelete = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "task-abort", children: ["a.md"] }),
      onDelete,
    }),
  );
  click("detail-delete-button");
  click("delete-orphan-strategy-abort");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["task-abort", "abort"]);
});

test("キャンセルでダイアログが閉じ onDelete は呼ばれない", () => {
  const onDelete = vi.fn();
  render(buildProps({ onDelete }));
  click("detail-delete-button");
  click("confirm-cancel-button");
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
  expect(onDelete).not.toHaveBeenCalled();
});

test("onDelete が失敗した場合、ダイアログが開いたまま isBusy が解除される", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("削除失敗"));
  render(buildProps({ task: createTask({ id: "task-fail" }), onDelete }));
  click("detail-delete-button");
  await act(async () => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLElement
    ).click();
  });
  expect(onDelete).toHaveBeenCalledWith("task-fail");
  await vi.waitFor(() => {
    expect(
      document.querySelector('[data-testid="confirm-dialog"]'),
    ).toBeTruthy();
    const confirmBtn = document.querySelector(
      '[data-testid="confirm-confirm-button"]',
    ) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    expect(confirmBtn.textContent).toBe("削除");
  });
});
