import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { BoardCardProvider } from "../../BoardCardProvider";
import { BoardColumnProvider } from "../../BoardColumnProvider";
import { Column } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * テスト用に最小限の Task を構築する。
 * @param overrides 上書きしたい一部フィールド
 * @returns Task
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
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

type RenderOptions = {
  /** Column メタ props（order はデフォルト 0） */
  column: Omit<Parameters<typeof Column>[0], "order"> & { order?: number };
  /** Provider に渡す表示用 tasks（未指定なら []） */
  tasks?: readonly Task[];
  /** Provider に渡す全 tasks（未指定なら tasks） */
  allTasks?: readonly Task[];
  /** Provider に渡す他カラム名（自カラムを除く）。Provider の columns に追加される */
  otherColumnNames?: readonly string[];
};

/**
 * BoardCardProvider / BoardColumnProvider 配下に Column を mount する。
 * @param options - レンダリングオプション
 */
function render(options: RenderOptions) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tasks = options.tasks ?? [];
  const allTasks = options.allTasks ?? tasks;
  const self = { name: options.column.name, order: 0 };
  const others = (options.otherColumnNames ?? []).map((name, i) => ({
    name,
    order: i + 1,
  }));
  const columns = [self, ...others];
  const tree: ReactNode = (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={new Map()}
    >
      <BoardColumnProvider columns={columns} tasks={tasks} allTasks={allTasks}>
        <Column order={0} {...options.column} />
      </BoardColumnProvider>
    </BoardCardProvider>
  );
  act(() => {
    root?.render(tree);
  });
}

function dispatchContextMenu(target: Element) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 50,
        clientY: 80,
      }),
    );
  });
}

test("ヘッダー右クリックでコンテキストメニューが表示される", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const menu = document.querySelector('[data-testid="column-context-menu"]');
  expect(menu).toBeTruthy();
});

test("onDelete 未指定時は右クリックしてもメニューが表示されない", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn() },
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const menu = document.querySelector('[data-testid="column-context-menu"]');
  expect(menu).toBeFalsy();
});

test("メニューの「削除」クリックで ConfirmDialog が表示される", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement;
  act(() => {
    deleteItem.click();
  });
  const dialog = document.querySelector('[data-testid="confirm-dialog"]');
  expect(dialog).toBeTruthy();
});

test("タスクありの場合、移動先ドロップダウンが表示される", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    tasks: [createTask({ status: "Todo" }), createTask({ id: "task-2" })],
    otherColumnNames: ["In Progress", "Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement;
  act(() => {
    deleteItem.click();
  });
  const dropdown = document.querySelector(
    '[data-testid="column-delete-destination"]',
  ) as HTMLSelectElement | null;
  expect(dropdown).toBeTruthy();
  const options = Array.from(dropdown?.options ?? []).map((o) => o.value);
  expect(options).toEqual(["In Progress", "Done"]);
});

test("タスクなしの場合、移動先ドロップダウンは表示されない", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement;
  act(() => {
    deleteItem.click();
  });
  const dropdown = document.querySelector(
    '[data-testid="column-delete-destination"]',
  );
  expect(dropdown).toBeFalsy();
});

test("表示カードが空でも allTasks にフィルタで隠れている分があれば移動先ドロップダウンを表示する", () => {
  const hiddenTasks = [
    createTask({ id: "h1", status: "Todo", filePath: "tasks/h1.md" }),
    createTask({ id: "h2", status: "Todo", filePath: "tasks/h2.md" }),
  ];
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    tasks: [],
    allTasks: hiddenTasks,
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  const dropdown = document.querySelector(
    '[data-testid="column-delete-destination"]',
  );
  expect(dropdown).toBeTruthy();
});

test("タスクありで確定すると onDelete が移動先と共に呼ばれる", () => {
  const onDelete = vi.fn();
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete },
    tasks: [createTask({ status: "Todo" })],
    otherColumnNames: ["In Progress", "Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  const dropdown = document.querySelector(
    '[data-testid="column-delete-destination"]',
  ) as HTMLSelectElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    nativeSetter?.call(dropdown, "Done");
    dropdown.dispatchEvent(new Event("change", { bubbles: true }));
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onDelete).toHaveBeenCalledWith("Done");
});

test("タスクなしで確定すると onDelete が undefined で呼ばれる", () => {
  const onDelete = vi.fn();
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onDelete).toHaveBeenCalledWith(undefined);
});

test("タスクがあるのに移動先カラムが無い場合、メニューの削除項目が無効化される", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
    tasks: [createTask({ status: "Todo" })],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement | null;
  expect(deleteItem?.disabled).toBe(true);
});

test("columns.length === 1 の場合、メニューの削除項目が無効化される (Provider 経由の canDelete)", () => {
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete: vi.fn() },
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement | null;
  expect(deleteItem?.disabled).toBe(true);
});

test("onDelete が reject した場合、ConfirmDialog は閉じずに開いたまま", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("backend reject"));
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  // ConfirmDialog は維持される
  const dialog = document.querySelector('[data-testid="confirm-dialog"]');
  expect(dialog).toBeTruthy();
});

test("onDelete pending 中の confirm ボタン連打は二重実行されない (re-entrant guard)", async () => {
  let resolveDelete!: () => void;
  const onDelete = vi.fn().mockImplementation(
    () =>
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
  );
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  // 1 回目 confirm
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  // 2 回目 confirm (re-entrant guard で抑止される想定)
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-confirm-button"]',
      ) as HTMLButtonElement
    )?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveDelete();
    await Promise.resolve();
  });
});

test("キャンセルで ConfirmDialog が閉じ、onDelete は呼ばれない", () => {
  const onDelete = vi.fn();
  render({
    column: { name: "Todo", onAddClick: vi.fn(), onDelete },
    otherColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  act(() => {
    (
      document.querySelector(
        '[data-testid="column-context-menu-delete"]',
      ) as HTMLButtonElement
    ).click();
  });
  act(() => {
    (
      document.querySelector(
        '[data-testid="confirm-cancel-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onDelete).not.toHaveBeenCalled();
  const dialog = document.querySelector('[data-testid="confirm-dialog"]');
  expect(dialog).toBeFalsy();
});
