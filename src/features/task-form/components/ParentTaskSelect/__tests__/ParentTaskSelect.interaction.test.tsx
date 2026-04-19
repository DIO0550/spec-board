import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";
import { ParentTaskSelect } from "..";

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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    title: "親候補",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/candidate.md",
    ...overrides,
  };
}

const TASKS: Task[] = [
  makeTask({ id: "t-1", title: "ログイン修正", filePath: "tasks/login.md" }),
  makeTask({
    id: "t-2",
    title: "検索機能追加",
    filePath: "tasks/search.md",
  }),
  makeTask({ id: "t-3", title: "", filePath: "tasks/empty-title.md" }),
];

/**
 * ParentTaskSelect をレンダリングするヘルパー
 * @param props - ParentTaskSelect に渡す props
 */
function render(props: Parameters<typeof ParentTaskSelect>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParentTaskSelect, props));
  });
}

/**
 * input 要素の値を変更して input イベントを発火する
 * @param el - 対象要素
 * @param value - 設定する値
 */
function changeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

test("未選択時は検索入力が表示される", () => {
  render({ tasks: TASKS, value: undefined, onChange: vi.fn() });
  expect(
    document.querySelector('[data-testid="parent-task-input"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-selected"]'),
  ).toBeNull();
});

test("フォーカスで候補一覧が開き全候補が表示される", () => {
  render({ tasks: TASKS, value: undefined, onChange: vi.fn() });
  const input = document.querySelector(
    '[data-testid="parent-task-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
  expect(
    document.querySelector('[data-testid="parent-task-list"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-option-t-1"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-option-t-2"]'),
  ).toBeTruthy();
});

test("検索クエリでタイトル部分一致の候補に絞り込まれる", () => {
  render({ tasks: TASKS, value: undefined, onChange: vi.fn() });
  const input = document.querySelector(
    '[data-testid="parent-task-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    changeValue(input, "検索");
  });
  expect(
    document.querySelector('[data-testid="parent-task-option-t-2"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="parent-task-option-t-1"]'),
  ).toBeNull();
});

test("候補クリックで onChange が選択したファイルパスで呼ばれる", () => {
  const onChange = vi.fn();
  render({ tasks: TASKS, value: undefined, onChange });
  const input = document.querySelector(
    '[data-testid="parent-task-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
  const option = document.querySelector(
    '[data-testid="parent-task-option-t-1"]',
  ) as HTMLElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  expect(onChange).toHaveBeenCalledWith("tasks/login.md");
});

test("選択済み状態ではタイトルと解除ボタンが表示される", () => {
  render({ tasks: TASKS, value: "tasks/login.md", onChange: vi.fn() });
  const selected = document.querySelector(
    '[data-testid="parent-task-selected"]',
  );
  expect(selected?.textContent).toBe("ログイン修正");
  expect(
    document.querySelector('[data-testid="parent-task-clear"]'),
  ).toBeTruthy();
});

test("解除ボタンで onChange が undefined で呼ばれる", () => {
  const onChange = vi.fn();
  render({ tasks: TASKS, value: "tasks/login.md", onChange });
  const clear = document.querySelector(
    '[data-testid="parent-task-clear"]',
  ) as HTMLButtonElement;
  act(() => {
    clear.click();
  });
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test("タイトル未設定のタスクはファイルパスで表示される", () => {
  render({ tasks: TASKS, value: "tasks/empty-title.md", onChange: vi.fn() });
  const selected = document.querySelector(
    '[data-testid="parent-task-selected"]',
  );
  expect(selected?.textContent).toBe("tasks/empty-title.md");
});

test("検索結果が 0 件の場合は空メッセージが表示される", () => {
  render({ tasks: TASKS, value: undefined, onChange: vi.fn() });
  const input = document.querySelector(
    '[data-testid="parent-task-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    changeValue(input, "該当なしキーワード");
  });
  expect(
    document.querySelector('[data-testid="parent-task-empty"]'),
  ).toBeTruthy();
});

test("disabled 指定時は入力が無効化される", () => {
  render({ tasks: TASKS, value: undefined, onChange: vi.fn(), disabled: true });
  const input = document.querySelector(
    '[data-testid="parent-task-input"]',
  ) as HTMLInputElement;
  expect(input.disabled).toBe(true);
});
