import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";
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

function createTask(overrides: Partial<Task> = {}): Task {
  return {
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
  };
}

function render(props: Parameters<typeof Column>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Column, props));
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
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: ["Done"],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const menu = document.querySelector('[data-testid="column-context-menu"]');
  expect(menu).toBeTruthy();
});

test("onDelete 未指定時は右クリックしてもメニューが表示されない", () => {
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const menu = document.querySelector('[data-testid="column-context-menu"]');
  expect(menu).toBeFalsy();
});

test("メニューの「削除」クリックで ConfirmDialog が表示される", () => {
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: ["Done"],
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
    name: "Todo",
    tasks: [createTask({ status: "Todo" }), createTask({ id: "task-2" })],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: ["In Progress", "Done"],
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
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: ["Done"],
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

test("タスクありで確定すると onDelete が移動先と共に呼ばれる", () => {
  const onDelete = vi.fn();
  render({
    name: "Todo",
    tasks: [createTask({ status: "Todo" })],
    onAddClick: vi.fn(),
    onDelete,
    existingColumnNames: ["In Progress", "Done"],
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
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete,
    existingColumnNames: ["Done"],
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
    name: "Todo",
    tasks: [createTask({ status: "Todo" })],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: [],
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement | null;
  expect(deleteItem?.disabled).toBe(true);
});

test("canDelete=false の場合、メニューの削除項目が無効化される", () => {
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete: vi.fn(),
    existingColumnNames: [],
    canDelete: false,
  });
  const header = container?.querySelector("section > div") as HTMLElement;
  dispatchContextMenu(header);
  const deleteItem = document.querySelector(
    '[data-testid="column-context-menu-delete"]',
  ) as HTMLButtonElement | null;
  expect(deleteItem?.disabled).toBe(true);
});

test("キャンセルで ConfirmDialog が閉じ、onDelete は呼ばれない", () => {
  const onDelete = vi.fn();
  render({
    name: "Todo",
    tasks: [],
    onAddClick: vi.fn(),
    onDelete,
    existingColumnNames: ["Done"],
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
