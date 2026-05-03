import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ColumnHeader } from "..";

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

function render(props: Parameters<typeof ColumnHeader>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ColumnHeader, props));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("onRename 指定時にステータス名クリックで編集モードになる", async () => {
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename: vi.fn(),
    existingColumnNames: ["In Progress", "Done"],
  });
  const nameButton = container?.querySelector(
    '[data-testid="column-name-button"]',
  ) as HTMLButtonElement | null;
  expect(nameButton).toBeTruthy();
  act(() => {
    nameButton?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement | null;
  expect(input).toBeTruthy();
  expect(input?.value).toBe("Todo");
});

test("新しい名前を入力して Enter で onRename が呼ばれる", async () => {
  const onRename = vi.fn();
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    existingColumnNames: ["In Progress", "Done"],
  });
  act(() => {
    (
      container?.querySelector(
        '[data-testid="column-name-button"]',
      ) as HTMLButtonElement | null
    )?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement;
  setInputValue(input, "Backlog");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onRename).toHaveBeenCalledWith("Backlog");
});

test("空文字で確定すると onRename は呼ばれず元に戻る", async () => {
  const onRename = vi.fn();
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    existingColumnNames: ["Done"],
  });
  act(() => {
    (
      container?.querySelector(
        '[data-testid="column-name-button"]',
      ) as HTMLButtonElement | null
    )?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement;
  setInputValue(input, "   ");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onRename).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    const button = container?.querySelector(
      '[data-testid="column-name-button"]',
    );
    expect(button?.textContent).toBe("Todo");
  });
});

test("既存カラム名と同じ名前で確定すると onRename は呼ばれずエラーが表示される", async () => {
  const onRename = vi.fn();
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    existingColumnNames: ["In Progress", "Done"],
  });
  act(() => {
    (
      container?.querySelector(
        '[data-testid="column-name-button"]',
      ) as HTMLButtonElement | null
    )?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement;
  setInputValue(input, "Done");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onRename).not.toHaveBeenCalled();
  const error = container?.querySelector('[role="alert"]');
  expect(error?.textContent).toContain("同じ名前");
  const stillEditing = container?.querySelector(
    '[data-testid="column-rename-input"]',
  );
  expect(stillEditing).toBeTruthy();
});

test("Esc で編集がキャンセルされ元の名前に戻る", async () => {
  const onRename = vi.fn();
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    existingColumnNames: ["Done"],
  });
  act(() => {
    (
      container?.querySelector(
        '[data-testid="column-name-button"]',
      ) as HTMLButtonElement | null
    )?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement;
  setInputValue(input, "Changed");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onRename).not.toHaveBeenCalled();
  await vi.waitFor(() => {
    const button = container?.querySelector(
      '[data-testid="column-name-button"]',
    );
    expect(button?.textContent).toBe("Todo");
  });
});

test("onRename が reject した場合、edit mode は維持される", async () => {
  const onRename = vi.fn().mockRejectedValue(new Error("backend reject"));
  render({
    name: "Todo",
    taskCount: 0,
    onAddClick: vi.fn(),
    onRename,
    existingColumnNames: ["In Progress", "Done"],
  });
  act(() => {
    (
      container?.querySelector(
        '[data-testid="column-name-button"]',
      ) as HTMLButtonElement | null
    )?.click();
  });
  const input = container?.querySelector(
    '[data-testid="column-rename-input"]',
  ) as HTMLInputElement;
  setInputValue(input, "Backlog");
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  // edit mode が維持されていることを確認 (input が DOM に残る)
  expect(
    container?.querySelector('[data-testid="column-rename-input"]'),
  ).toBeTruthy();
});

test("onRename 未指定時は編集用ボタンが表示されない", async () => {
  render({ name: "Todo", taskCount: 0, onAddClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("Todo");
  });
  const nameButton = container?.querySelector(
    '[data-testid="column-name-button"]',
  );
  expect(nameButton).toBeFalsy();
});
