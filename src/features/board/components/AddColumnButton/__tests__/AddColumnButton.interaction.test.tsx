import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { AddColumnButton } from "..";

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
 * AddColumnButton をレンダリングするヘルパー
 * @param props - AddColumnButton に渡す props
 */
function render(props: Parameters<typeof AddColumnButton>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(AddColumnButton, props));
  });
}

/**
 * ネイティブ setter 経由で input に値を設定する
 * @param input - 対象の input 要素
 * @param value - 設定する値
 */
function setInputValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

test("初期表示で「+ カラムを追加」ボタンが表示される", () => {
  render({ existingColumnNames: [], onAdd: vi.fn() });
  const button = document.querySelector(
    '[data-testid="add-column-button"]',
  ) as HTMLButtonElement | null;
  expect(button?.textContent).toContain("+ カラムを追加");
});

test("ボタンクリックで入力フィールドが表示される", () => {
  render({ existingColumnNames: [], onAdd: vi.fn() });
  const button = document.querySelector(
    '[data-testid="add-column-button"]',
  ) as HTMLButtonElement;
  act(() => {
    button.click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement | null;
  expect(input).toBeTruthy();
});

test("名前を入力して Enter で onAdd が呼ばれる", () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: ["Todo"], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "Review");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAdd).toHaveBeenCalledWith("Review");
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test("入力前後の空白は trim されて onAdd に渡される", () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "  Review  ");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAdd).toHaveBeenCalledWith("Review");
});

test("確定後はボタン表示に戻る", async () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "Review");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  // confirm が async 化されたため、microtask flush 後にボタンが復活する
  await act(async () => {
    await Promise.resolve();
  });
  const button = document.querySelector('[data-testid="add-column-button"]');
  expect(button).toBeTruthy();
});

test("onAdd が reject した場合、editor は開いたままで入力値も保持される", async () => {
  const onAdd = vi.fn().mockRejectedValue(new Error("backend reject"));
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "Review");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  // editor (input) は維持される、トリガーボタンには戻らない
  expect(
    document.querySelector('[data-testid="add-column-input"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="add-column-button"]'),
  ).toBeNull();
  // 入力値も保持
  const stillInput = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  expect(stillInput.value).toBe("Review");
});

test("onAdd 実行中の Enter 連打は二重実行されない (re-entrant guard)", async () => {
  let resolveAdd!: () => void;
  const onAdd = vi.fn().mockImplementation(
    () =>
      new Promise<void>((res) => {
        resolveAdd = res;
      }),
  );
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "Review");
  });
  // 1 回目 Enter (onAdd は pending のまま)
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  // 2 回目 Enter (re-entrant guard で抑止される想定)
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(onAdd).toHaveBeenCalledTimes(1);
  // pending 解放
  await act(async () => {
    resolveAdd();
    await Promise.resolve();
  });
});

test("空文字で Enter しても onAdd は呼ばれない", () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "   ");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAdd).not.toHaveBeenCalled();
});

test("既存と同名の場合 onAdd は呼ばれず入力状態が維持される", () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: ["Todo", "Done"], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "Todo");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAdd).not.toHaveBeenCalled();
  const stillInput = document.querySelector('[data-testid="add-column-input"]');
  expect(stillInput).toBeTruthy();
  const alert = document.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("同じ名前");
});

test("Esc でキャンセルされボタン表示に戻る", () => {
  const onAdd = vi.fn();
  render({ existingColumnNames: [], onAdd });
  act(() => {
    (
      document.querySelector(
        '[data-testid="add-column-button"]',
      ) as HTMLButtonElement
    ).click();
  });
  const input = document.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    setInputValue(input, "途中入力");
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onAdd).not.toHaveBeenCalled();
  const button = document.querySelector('[data-testid="add-column-button"]');
  expect(button).toBeTruthy();
  const stillInput = document.querySelector('[data-testid="add-column-input"]');
  expect(stillInput).toBeFalsy();
});
