import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { createDeleteFlowWrapper } from "../../DeleteFlowProvider/wrapper";
import { createDetailWrapper } from "../../DetailProvider/wrapper";
import { PropertiesSidebar } from "..";

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

/** render に渡す引数（両 Provider の上書きと PropertiesSidebar の props） */
type RenderArgs = {
  detail?: Parameters<typeof createDetailWrapper>[0];
  deleteFlow?: Parameters<typeof createDeleteFlowWrapper>[0];
  onArchive?: () => void;
};

/**
 * 両 Provider 配下に PropertiesSidebar を mount する。task は両 Provider に同じものを渡す。
 * @param args - detail / deleteFlow の wrapper 引数と onArchive
 */
function render(args: RenderArgs = {}) {
  const task = args.detail?.task ?? createTask();
  const Detail = createDetailWrapper({
    task,
    columns: testColumns,
    ...args.detail,
  });
  const DeleteFlow = createDeleteFlowWrapper({ task, ...args.deleteFlow });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Detail>
        <DeleteFlow>
          <PropertiesSidebar onArchive={args.onArchive} />
        </DeleteFlow>
      </Detail>,
    );
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

/**
 * 指定 testid のラジオ input を返す。
 * @param testId - data-testid
 * @returns ラジオ input 要素
 */
const radio = (testId: string): HTMLInputElement =>
  document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;

test("初期状態では ConfirmDialog を描画しない", () => {
  render();
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
});

test("削除ボタン押下で ConfirmDialog が開く", () => {
  render();
  click("detail-delete-button");
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeTruthy();
});

test("確定ボタン押下で onDelete が呼ばれる", () => {
  const onDelete = vi.fn();
  render({ deleteFlow: { onDelete } });
  click("detail-delete-button");
  click("confirm-confirm-button");
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test("キャンセルボタン押下でダイアログが閉じる", () => {
  render();
  click("detail-delete-button");
  click("confirm-cancel-button");
  expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull();
});

test("子あり: abort ラジオ選択後の確定で onDelete(id, 'abort') が呼ばれる", () => {
  const onDelete = vi.fn();
  const task = createTask({ children: ["a.md"] });
  render({ detail: { task }, deleteFlow: { onDelete } });
  click("detail-delete-button");
  click("delete-orphan-strategy-abort");
  click("confirm-confirm-button");
  expect(onDelete.mock.calls[0]).toEqual(["task-1", "abort"]);
});

test("子あり: abort ラジオ選択で checked が切り替わる", () => {
  render({ detail: { task: createTask({ children: ["a.md"] }) } });
  click("detail-delete-button");
  click("delete-orphan-strategy-abort");
  expect(radio("delete-orphan-strategy-abort").checked).toBe(true);
  expect(radio("delete-orphan-strategy-clear").checked).toBe(false);
});

test("子あり: 再度削除ボタンを押すと clear に戻る", () => {
  render({ detail: { task: createTask({ children: ["a.md"] }) } });
  click("detail-delete-button");
  click("delete-orphan-strategy-abort");
  click("confirm-cancel-button");
  click("detail-delete-button");
  expect(radio("delete-orphan-strategy-clear").checked).toBe(true);
});
