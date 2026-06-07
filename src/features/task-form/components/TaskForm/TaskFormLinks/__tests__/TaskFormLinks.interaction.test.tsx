import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskFormLinks } from "@/features/task-form/components/TaskForm/TaskFormLinks";

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

const render = (props: Parameters<typeof TaskFormLinks>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormLinks, props));
  });
};

const baseProps = (
  overrides: Partial<Parameters<typeof TaskFormLinks>[0]>,
) => ({
  links: [],
  selectedTasks: [],
  candidates: [],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  ...overrides,
});

test("links 2 件で chip が 2 件（title 表示）描画される", () => {
  const a = makeTask({ id: "a", title: "タスクA" });
  const b = makeTask({ id: "b", title: "タスクB" });
  render(
    baseProps({
      links: [a.filePath, b.filePath],
      selectedTasks: [a, b],
    }),
  );

  expect(container?.textContent).toContain("タスクA");
  expect(container?.textContent).toContain("タスクB");
});

test("links 空のとき chip は描画されずピッカーのみ表示される", () => {
  render(baseProps({}));

  expect(document.querySelector('[aria-label^="関連タスク「"]')).toBeNull();
  expect(
    document.querySelector('[data-testid="task-form-links-select"]'),
  ).toBeTruthy();
});

test("ピッカーで候補を選択すると onAdd が filePath で呼ばれる", () => {
  const onAdd = vi.fn();
  const candidate = makeTask({ id: "c", title: "候補タスク" });
  render(
    baseProps({
      candidates: [candidate],
      onAdd,
    }),
  );

  const input = document.querySelector(
    '[data-testid="task-form-links-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
  const option = document.querySelector(
    '[data-testid="task-form-links-option-c"]',
  ) as HTMLElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });

  expect(onAdd).toHaveBeenCalledWith(candidate.filePath);
});

test("chip の × クリックで onRemove が filePath で呼ばれる", () => {
  const onRemove = vi.fn();
  const a = makeTask({ id: "a", title: "タスクA" });
  render(
    baseProps({
      links: [a.filePath],
      selectedTasks: [a],
      onRemove,
    }),
  );

  const removeButton = document.querySelector(
    '[aria-label="関連タスク「タスクA」を削除"]',
  ) as HTMLButtonElement;
  act(() => {
    removeButton.click();
  });

  expect(onRemove).toHaveBeenCalledWith(a.filePath);
});

test("候補が空のときピッカーの input が disabled になる", () => {
  render(baseProps({ candidates: [] }));

  const input = document.querySelector(
    '[data-testid="task-form-links-input"]',
  ) as HTMLInputElement;
  expect(input.disabled).toBe(true);
});

test("disabled（送信中）で chip 削除ボタンとピッカーがともに無効になる", () => {
  const a = makeTask({ id: "a", title: "タスクA" });
  const candidate = makeTask({ id: "c", title: "候補タスク" });
  render(
    baseProps({
      links: [a.filePath],
      selectedTasks: [a],
      candidates: [candidate],
      disabled: true,
    }),
  );

  const removeButton = document.querySelector(
    '[aria-label="関連タスク「タスクA」を削除"]',
  ) as HTMLButtonElement;
  const input = document.querySelector(
    '[data-testid="task-form-links-input"]',
  ) as HTMLInputElement;
  expect(removeButton.disabled).toBe(true);
  expect(input.disabled).toBe(true);
});

test("links chip の削除ボタン aria-label が「関連タスク「…」を削除」になる", () => {
  const a = makeTask({ id: "a", title: "タスクA" });
  render(
    baseProps({
      links: [a.filePath],
      selectedTasks: [a],
    }),
  );

  expect(
    document.querySelector('[aria-label="関連タスク「タスクA」を削除"]'),
  ).toBeTruthy();
});

test("ピッカーに label「関連タスク」が付く", () => {
  render(baseProps({}));

  expect(container?.textContent).toContain("関連タスク");
});

test("逆引きできた chip 本体の title 属性に filePath が入る（同名タスク判別）", () => {
  const a = makeTask({ id: "a", title: "タスクA" });
  render(
    baseProps({
      links: [a.filePath],
      selectedTasks: [a],
    }),
  );

  expect(document.querySelector(`[title="${a.filePath}"]`)).toBeTruthy();
});
