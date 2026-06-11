import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { BrokenLinkSet } from "@/domains/broken-link";
import { Task, type TaskPayload } from "@/types/task";
import { PropertiesSidebar } from "..";

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
 * PropertiesSidebar の必須 props にデフォルトを与えるヘルパー。
 * @param overrides - 上書きする props
 * @returns PropertiesSidebar の props
 */
function buildProps(
  overrides: Partial<Parameters<typeof PropertiesSidebar>[0]> = {},
): Parameters<typeof PropertiesSidebar>[0] {
  const task = overrides.task ?? createTask();
  return {
    task,
    columns: testColumns,
    childInfo: {
      childTasks: [],
      descendantTasks: [],
      effectiveDoneColumn: "Done",
    },
    parentTask: null,
    brokenLinks: noBrokenLinks,
    handlers: {
      onStatusChange: vi.fn(),
      onPriorityChange: vi.fn(),
      onLabelAdd: vi.fn(),
      onLabelRemove: vi.fn(),
  onChangeDraft: vi.fn(),
    },
    onDelete: vi.fn(),
    ...overrides,
  };
}

/**
 * PropertiesSidebar をレンダリングするヘルパー
 * @param props - PropertiesSidebar に渡す props
 */
function render(props: Parameters<typeof PropertiesSidebar>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(PropertiesSidebar, props));
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

test("削除ボタン押下で ConfirmDialog が表示される", () => {
  render(buildProps());
  click("detail-delete-button");
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
});

test("子なし削除の確定で onDelete(id) が呼ばれる", () => {
  const onDelete = vi.fn();
  render(
    buildProps({ task: createTask({ id: "t-x", children: [] }), onDelete }),
  );
  click("detail-delete-button");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["t-x"]);
});

test("子あり削除（clear のまま）の確定で onDelete(id, 'clear')", () => {
  const onDelete = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t-c", children: ["a.md"] }),
      onDelete,
    }),
  );
  click("detail-delete-button");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["t-c", "clear"]);
});

test("子あり削除（abort 切替）の確定で onDelete(id, 'abort')", () => {
  const onDelete = vi.fn();
  render(
    buildProps({
      task: createTask({ id: "t-a", children: ["a.md"] }),
      onDelete,
    }),
  );
  click("detail-delete-button");
  click("delete-orphan-strategy-abort");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["t-a", "abort"]);
});

test("キャンセルで onDelete が呼ばれない", () => {
  const onDelete = vi.fn();
  render(buildProps({ onDelete }));
  click("detail-delete-button");
  click("confirm-cancel-button");
  expect(onDelete).not.toHaveBeenCalled();
});

test("削除ダイアログの開閉で onDeleteFlowOpenChange が値変化時のみ通知される（初回 false の誤通知なし）", () => {
  const onDeleteFlowOpenChange = vi.fn();
  render(buildProps({ onDeleteFlowOpenChange }));
  // 初回マウントでは通知されない
  expect(onDeleteFlowOpenChange).not.toHaveBeenCalled();
  click("detail-delete-button");
  expect(onDeleteFlowOpenChange).toHaveBeenLastCalledWith(true);
  click("confirm-cancel-button");
  expect(onDeleteFlowOpenChange).toHaveBeenLastCalledWith(false);
});
