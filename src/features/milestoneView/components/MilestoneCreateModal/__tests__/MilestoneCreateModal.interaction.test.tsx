import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MilestoneCreateModal } from "..";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderModal = (
  props: Partial<React.ComponentProps<typeof MilestoneCreateModal>> = {},
) => {
  const merged: React.ComponentProps<typeof MilestoneCreateModal> = {
    onCreate: vi.fn(async () => true),
    onClose: vi.fn(),
    isPending: false,
    ...props,
  };
  act(() => {
    root.render(createElement(MilestoneCreateModal, merged));
  });
  return merged;
};

const requireByTestId = <T extends HTMLElement = HTMLElement>(
  id: string,
): T => {
  const el = container.querySelector<T>(`[data-testid="${id}"]`);
  return el as T;
};

const setInputValue = (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

test("名前未入力時は送信ボタンが disabled", () => {
  renderModal();
  const submit = requireByTestId(
    "milestone-create-submit",
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
});

test("名前を入力すると送信ボタンが有効化される", () => {
  renderModal();
  const nameInput = requireByTestId(
    "milestone-create-name",
  ) as HTMLInputElement;
  setInputValue(nameInput, "v1.7");
  const submit = requireByTestId(
    "milestone-create-submit",
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
});

test("送信時に正規化された CreateMilestoneArgs で onCreate を呼ぶ", async () => {
  const onCreate = vi.fn(async () => true);
  const onClose = vi.fn();
  renderModal({ onCreate, onClose });

  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "  v1.7  ",
  );
  setInputValue(
    requireByTestId("milestone-create-title") as HTMLInputElement,
    "通知センター",
  );
  setInputValue(
    requireByTestId("milestone-create-due") as HTMLInputElement,
    "2026-08-25",
  );
  setInputValue(
    requireByTestId("milestone-create-description") as HTMLTextAreaElement,
    "メンション通知",
  );

  await act(async () => {
    requireByTestId("milestone-create-submit").click();
  });

  expect(onCreate).toHaveBeenCalledWith({
    name: "v1.7",
    title: "通知センター",
    due: "2026-08-25",
    description: "メンション通知",
  });
  expect(onClose).toHaveBeenCalled();
});

test("onCreate が false を返したら onClose を呼ばない", async () => {
  const onCreate = vi.fn(async () => false);
  const onClose = vi.fn();
  renderModal({ onCreate, onClose });

  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "v1.7",
  );
  await act(async () => {
    requireByTestId("milestone-create-submit").click();
  });

  expect(onCreate).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test("空文字フィールドは undefined に正規化される", async () => {
  const onCreate = vi.fn(async () => true);
  renderModal({ onCreate });

  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "v2.0",
  );
  await act(async () => {
    requireByTestId("milestone-create-submit").click();
  });

  expect(onCreate).toHaveBeenCalledWith({
    name: "v2.0",
    title: undefined,
    due: undefined,
    description: undefined,
  });
});

test("キャンセルボタンで onClose を呼ぶ", () => {
  const onClose = vi.fn();
  renderModal({ onClose });
  const buttons = container.querySelectorAll("button");
  const cancel = Array.from(buttons).find(
    (b) => b.textContent === "キャンセル",
  );
  expect(cancel).toBeTruthy();
  act(() => {
    cancel?.click();
  });
  expect(onClose).toHaveBeenCalled();
});

test("overlay クリックで onClose を呼ぶ", () => {
  const onClose = vi.fn();
  renderModal({ onClose });
  const overlay = requireByTestId("milestone-create-overlay");
  act(() => {
    overlay.click();
  });
  expect(onClose).toHaveBeenCalled();
});

test("pending 中は送信・閉じる操作が無効化される", () => {
  const onClose = vi.fn();
  renderModal({ onClose, isPending: true });

  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "v1.7",
  );

  const submit = requireByTestId(
    "milestone-create-submit",
  ) as HTMLButtonElement;
  const overlay = requireByTestId(
    "milestone-create-overlay",
  ) as HTMLButtonElement;
  const closeBtn = requireByTestId(
    "milestone-create-close",
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(overlay.disabled).toBe(true);
  expect(closeBtn.disabled).toBe(true);
  expect(submit.textContent).toBe("作成中…");
});

test("Escape キーで onClose を呼ぶ", () => {
  const onClose = vi.fn();
  renderModal({ onClose });
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onClose).toHaveBeenCalled();
});
