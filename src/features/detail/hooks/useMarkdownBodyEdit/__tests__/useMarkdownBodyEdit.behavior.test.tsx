import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  MarkdownBodyEditMode,
  type UseMarkdownBodyEditArgs,
  type UseMarkdownBodyEditResult,
  useMarkdownBodyEdit,
} from "..";

let container: HTMLDivElement;
let root: Root;
let captured: UseMarkdownBodyEditResult | null = null;

/**
 * useMarkdownBodyEdit の挙動をテストする harness component。
 * captured 経由で hook 戻り値を test 側から参照する。
 */
const TestHost = (args: UseMarkdownBodyEditArgs) => {
  captured = useMarkdownBodyEdit(args);
  return null;
};

const mount = (args: UseMarkdownBodyEditArgs): void => {
  act(() => {
    root.render(<TestHost {...args} />);
  });
};

const rerender = (args: UseMarkdownBodyEditArgs): void => {
  act(() => {
    root.render(<TestHost {...args} />);
  });
};

/**
 * preventDefault / stopPropagation を spy 化した KeyboardEvent-like を生成。
 * React の SyntheticEvent 互換最低限のフィールドを揃える。
 */
type FakeKeyboardEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
  nativeEvent: { isComposing: boolean };
};

const makeFakeKey = (
  init: Partial<FakeKeyboardEvent> & { key: string },
): FakeKeyboardEvent => ({
  key: init.key,
  metaKey: init.metaKey ?? false,
  ctrlKey: init.ctrlKey ?? false,
  shiftKey: init.shiftKey ?? false,
  isComposing: init.isComposing ?? false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  nativeEvent: { isComposing: init.isComposing ?? false },
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  captured = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  captured = null;
});

test("初回 render では mode が display で editValue が body と一致する", () => {
  mount({ body: "abc" });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
  expect(captured?.editValue).toBe("abc");
});

test("onConfirm 未指定なら isEditable=false", () => {
  mount({ body: "abc" });
  expect(captured?.isEditable).toBe(false);
});

test("onConfirm 指定なら isEditable=true", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  expect(captured?.isEditable).toBe(true);
});

test("handleDisplayClick で mode が edit に切り替わり editValue が body にリセットされる", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  act(() => {
    captured?.handleDisplayClick();
  });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
  expect(captured?.editValue).toBe("abc");
});

test("handleDisplayClick は isEditable=false のとき no-op", () => {
  mount({ body: "abc" });
  act(() => {
    captured?.handleDisplayClick();
  });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
});

test("handleDisplayKeyDown(Enter) で edit モードに入る", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  const e = makeFakeKey({ key: "Enter" });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleDisplayKeyDown(e as any);
  });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
  expect(e.preventDefault).toHaveBeenCalled();
});

test("handleDisplayKeyDown(Space) で edit モードに入る", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  const e = makeFakeKey({ key: " " });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleDisplayKeyDown(e as any);
  });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
});

test("handleDisplayKeyDown(他キー) では mode が変わらない", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  const e = makeFakeKey({ key: "a" });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleDisplayKeyDown(e as any);
  });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
});

test("textareaRef(element) で focus + 末尾カーソル設定が行われる", () => {
  mount({ body: "abcdef", onConfirm: vi.fn() });
  const textarea = document.createElement("textarea");
  textarea.value = "abcdef";
  document.body.appendChild(textarea);
  act(() => {
    captured?.textareaRef(textarea);
  });
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(6);
  expect(textarea.selectionEnd).toBe(6);
  textarea.remove();
});

test("textareaRef(null) は no-op", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  expect(() => {
    act(() => {
      captured?.textareaRef(null);
    });
  }).not.toThrow();
});

test("Cmd+Enter で変更ありなら onConfirm(editValue) 発火 + display に戻る", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("xyz");
  });
  const e = makeFakeKey({ key: "Enter", metaKey: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).toHaveBeenCalledWith("xyz");
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
  expect(e.preventDefault).toHaveBeenCalled();
  expect(e.stopPropagation).toHaveBeenCalled();
});

test("Ctrl+Enter でも同様に commit する", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("xyz");
  });
  const e = makeFakeKey({ key: "Enter", ctrlKey: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).toHaveBeenCalledWith("xyz");
});

test("Cmd+Enter で editValue===body の場合 onConfirm 未発火 + display へ戻る", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  const e = makeFakeKey({ key: "Enter", metaKey: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
});

test("先頭/末尾の空白だけ追加した編集の Cmd+Enter は onConfirm を呼ぶ（trim 比較不採用）", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("abc\n  ");
  });
  const e = makeFakeKey({ key: "Enter", metaKey: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).toHaveBeenCalledWith("abc\n  ");
});

test("空文字に編集した Cmd+Enter は onConfirm('') を呼ぶ", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("");
  });
  const e = makeFakeKey({ key: "Enter", metaKey: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).toHaveBeenCalledWith("");
});

test("IME 変換中(isComposing=true)の Cmd+Enter は onConfirm 未発火、preventDefault/stopPropagation は呼ばれる", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("xyz");
  });
  const e = makeFakeKey({ key: "Enter", metaKey: true, isComposing: true });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(e.preventDefault).toHaveBeenCalled();
  expect(e.stopPropagation).toHaveBeenCalled();
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
});

test("Esc で onConfirm 未発火 + editValue が body に戻り display へ遷移", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("draft");
  });
  const e = makeFakeKey({ key: "Escape" });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Display);
  expect(captured?.editValue).toBe("abc");
  expect(e.preventDefault).toHaveBeenCalled();
  expect(e.stopPropagation).toHaveBeenCalled();
});

test("Enter (修飾なし) は textarea ハンドラで何もしない（改行をブロックしない）", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  const e = makeFakeKey({ key: "Enter" });
  act(() => {
    // biome-ignore lint/suspicious/noExplicitAny: harness 用の最小限の型整合
    captured?.handleTextareaKeyDown(e as any);
  });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
  expect(e.preventDefault).not.toHaveBeenCalled();
});

test("body が rerender で変わっても hook 内 state は維持される（呼び出し側で key 再マウントする契約）", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  act(() => {
    captured?.handleDisplayClick();
  });
  act(() => {
    captured?.setEditValue("draft");
  });
  rerender({ body: "different", onConfirm });
  expect(captured?.mode).toBe(MarkdownBodyEditMode.Edit);
  expect(captured?.editValue).toBe("draft");
});
