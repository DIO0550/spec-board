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

test("送信時の CreateMilestoneArgs は name をトリムせず、任意項目は空文字を undefined に倒す", async () => {
  const onCreate = vi.fn(async () => true);
  const onClose = vi.fn();
  renderModal({ onCreate, onClose });

  // name は spec 上 unnormalized 完全一致キーのため両端空白を保つ。
  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "  v1.7  ",
  );
  // 任意項目はトリムして空なら undefined。
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
    name: "  v1.7  ",
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
  const closeBtn = requireByTestId(
    "milestone-create-close",
  ) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(closeBtn.disabled).toBe(true);
  expect(submit.textContent).toBe("作成中…");

  // overlay は div role="presentation" でクリック可能だが、pending 中は
  // onClick が外れるため onClose を呼ばないことで無効化を担保する。
  const overlay = requireByTestId("milestone-create-overlay");
  act(() => {
    overlay.click();
  });
  expect(onClose).not.toHaveBeenCalled();
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

test("nameの変更に追従してslug previewを更新する", () => {
  renderModal();
  setInputValue(
    requireByTestId("milestone-create-name") as HTMLInputElement,
    "Mobile Release 1.8",
  );
  expect(requireByTestId("milestone-create-slug").textContent).toContain(
    "mobile-release-1-8",
  );
});

test("optional labelsとassigneeの変更をcallbackへ通知する", () => {
  const onLabelsChange = vi.fn();
  const onAssigneeChange = vi.fn();
  renderModal({
    labelOptions: ["release", "frontend"],
    assigneeOptions: ["mika"],
    onLabelsChange,
    onAssigneeChange,
  });

  setInputValue(
    requireByTestId("milestone-create-labels") as HTMLInputElement,
    "release, frontend",
  );
  const assignee = requireByTestId(
    "milestone-create-assignee",
  ) as HTMLSelectElement;
  act(() => {
    assignee.value = "mika";
    assignee.dispatchEvent(new Event("change", { bubbles: true }));
  });

  expect(onLabelsChange).toHaveBeenLastCalledWith(["release", "frontend"]);
  expect(onAssigneeChange).toHaveBeenLastCalledWith("mika");
});

test("inline表示ではdialog本体へautofocusしない", () => {
  renderModal({ inline: true });
  const dialog = requireByTestId("milestone-create-modal");

  expect(document.activeElement).not.toBe(dialog);
});
