import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { EMPTY_TASK_FILTER } from "@/features/board/lib/applyTaskFilter";
import type { SavedFilter } from "@/features/board/lib/savedFilters";
import { SavedFilterMenu } from "..";

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

const SAVED: SavedFilter = {
  name: "高優先度のバグ",
  criteria: { ...EMPTY_TASK_FILTER, labels: ["bug"], priorities: ["High"] },
};

/**
 * SavedFilterMenu を描画する。
 * @param props - 上書きする props
 */
function renderMenu(
  props: Partial<Parameters<typeof SavedFilterMenu>[0]> = {},
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(SavedFilterMenu, {
        filters: [SAVED],
        isFilterActive: true,
        criteria: { ...EMPTY_TASK_FILTER, keyword: "current" },
        onApply: vi.fn(),
        onSave: vi.fn(() => true),
        onRemove: vi.fn(),
        ...props,
      }),
    );
  });
}

/** trigger を押して popover を開く。 */
function openPopover() {
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>("[data-testid='saved-filter-trigger']")
      ?.click();
  });
}

test("trigger クリックで popover が開き保存済み一覧を表示する", () => {
  renderMenu();
  expect(
    container?.querySelector("[data-testid='saved-filter-popover']"),
  ).toBeNull();
  openPopover();
  expect(
    container?.querySelector("[data-testid='saved-filter-popover']"),
  ).not.toBeNull();
  expect(container?.textContent).toContain("高優先度のバグ");
});

test("一覧のクリックで onApply が保存済み条件で呼ばれ popover が閉じる", () => {
  const onApply = vi.fn();
  renderMenu({ onApply });
  openPopover();
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>("[data-testid='saved-filter-apply']")
      ?.click();
  });
  expect(onApply).toHaveBeenCalledWith(SAVED.criteria);
  expect(
    container?.querySelector("[data-testid='saved-filter-popover']"),
  ).toBeNull();
});

test("名前を入力して保存すると onSave が現在条件で呼ばれ入力がクリアされる", () => {
  const onSave = vi.fn(() => true);
  const criteria = { ...EMPTY_TASK_FILTER, keyword: "current" };
  renderMenu({ onSave, criteria });
  openPopover();
  const input = container?.querySelector<HTMLInputElement>(
    "[data-testid='saved-filter-name-input']",
  );
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "  新しいフィルタ  ");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>("[data-testid='saved-filter-save']")
      ?.click();
  });
  expect(onSave).toHaveBeenCalledWith("新しいフィルタ", criteria);
  expect(
    container?.querySelector<HTMLInputElement>(
      "[data-testid='saved-filter-name-input']",
    )?.value,
  ).toBe("");
});

test("絞り込みが無効なときは保存入力と保存ボタンが無効になる", () => {
  renderMenu({ isFilterActive: false });
  openPopover();
  expect(
    container?.querySelector<HTMLInputElement>(
      "[data-testid='saved-filter-name-input']",
    )?.disabled,
  ).toBe(true);
  expect(
    container?.querySelector<HTMLButtonElement>(
      "[data-testid='saved-filter-save']",
    )?.disabled,
  ).toBe(true);
});

test("削除ボタンで onRemove が呼ばれる", () => {
  const onRemove = vi.fn();
  renderMenu({ onRemove });
  openPopover();
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find(
        (button) =>
          button.getAttribute("aria-label") === "高優先度のバグ を削除",
      )
      ?.click();
  });
  expect(onRemove).toHaveBeenCalledWith("高優先度のバグ");
});

test("0 件のときは空状態メッセージを表示する", () => {
  renderMenu({ filters: [] });
  openPopover();
  expect(container?.textContent).toContain("保存済みフィルタはありません");
});
