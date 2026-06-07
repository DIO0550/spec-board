import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MarkdownBody } from "..";

let container: HTMLDivElement;
let root: Root;

type Props = Parameters<typeof MarkdownBody>[0];

const mount = (props: Props): void => {
  act(() => {
    root.render(createElement(MarkdownBody, props));
  });
};

const queryTextarea = (): HTMLTextAreaElement | null =>
  document.querySelector<HTMLTextAreaElement>(
    '[data-testid="markdown-body-textarea"]',
  );

const requireTextarea = (): HTMLTextAreaElement => {
  const textarea = queryTextarea();
  expect(textarea).not.toBeNull();
  return textarea as HTMLTextAreaElement;
};

const queryDisplay = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="markdown-body"]');

const requireDisplay = (): HTMLElement => {
  const display = queryDisplay();
  expect(display).not.toBeNull();
  return display as HTMLElement;
};

const clickDisplay = (): void => {
  const display = requireDisplay();
  act(() => {
    display.click();
  });
};

const setTextareaValue = (value: string): void => {
  const textarea = requireTextarea();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

type KeyInit = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
};

const pressKeyOn = (target: Element, key: string, init: KeyInit = {}): void => {
  act(() => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      metaKey: init.metaKey ?? false,
      ctrlKey: init.ctrlKey ?? false,
      shiftKey: init.shiftKey ?? false,
    });
    Object.defineProperty(event, "isComposing", {
      value: init.isComposing ?? false,
    });
    target.dispatchEvent(event);
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

test("onConfirm 未指定 + 空 body は null を返す（従来挙動）", () => {
  mount({ body: "" });
  expect(queryDisplay()).toBeNull();
  expect(queryTextarea()).toBeNull();
});

test("onConfirm 未指定 + 非空 body は Markdown 描画のみで textarea は出ない", () => {
  mount({ body: "# hello" });
  const display = requireDisplay();
  expect(display.getAttribute("role")).not.toBe("button");
  act(() => {
    display.click();
  });
  expect(queryTextarea()).toBeNull();
});

test("onConfirm 指定 + 空 body は placeholder が表示される", () => {
  mount({ body: "", onConfirm: vi.fn() });
  const display = requireDisplay();
  expect(display.textContent).toContain("本文を追加");
});

test("display エリアをクリックすると textarea が表示される", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  clickDisplay();
  expect(queryTextarea()).not.toBeNull();
});

test("display エリアで Enter キーを押すと textarea が表示される", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  pressKeyOn(requireDisplay(), "Enter");
  expect(queryTextarea()).not.toBeNull();
});

test("display エリアで Space キーを押すと textarea が表示される", () => {
  mount({ body: "abc", onConfirm: vi.fn() });
  pressKeyOn(requireDisplay(), " ");
  expect(queryTextarea()).not.toBeNull();
});

test("edit 進入時の textarea が focus され、カーソルが末尾にある", () => {
  mount({ body: "abcdef", onConfirm: vi.fn() });
  clickDisplay();
  const textarea = requireTextarea();
  expect(document.activeElement).toBe(textarea);
  expect(textarea.selectionStart).toBe(6);
  expect(textarea.selectionEnd).toBe(6);
});

test("Cmd+Enter で onConfirm が編集値で呼ばれる", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  setTextareaValue("新しい本文");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith("新しい本文");
  expect(queryTextarea()).toBeNull();
});

test("Ctrl+Enter で onConfirm が編集値で呼ばれる", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  setTextareaValue("ctrl 確定");
  pressKeyOn(requireTextarea(), "Enter", { ctrlKey: true });
  expect(onConfirm).toHaveBeenCalledWith("ctrl 確定");
});

test("Esc で onConfirm が呼ばれず textarea が消えて display に戻る", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  setTextareaValue("捨てる");
  pressKeyOn(requireTextarea(), "Escape");
  expect(onConfirm).not.toHaveBeenCalled();
  expect(queryTextarea()).toBeNull();
  expect(queryDisplay()).not.toBeNull();
});

test("未変更(strict equality)の Cmd+Enter は onConfirm を呼ばずに display へ戻る", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onConfirm).not.toHaveBeenCalled();
  expect(queryTextarea()).toBeNull();
});

test("先頭/末尾の空白だけ追加した Cmd+Enter は onConfirm を呼ぶ（trim 不採用）", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  setTextareaValue("abc\n  ");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onConfirm).toHaveBeenCalledWith("abc\n  ");
});

test("空文字に編集した Cmd+Enter は onConfirm('') を呼ぶ", () => {
  const onConfirm = vi.fn();
  mount({ body: "abc", onConfirm });
  clickDisplay();
  setTextareaValue("");
  pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
  expect(onConfirm).toHaveBeenCalledWith("");
});

test("IME 変換中(isComposing=true)の Cmd+Enter は onConfirm を呼ばず document keydown へも伝播しない", () => {
  // document リスナを使うのは useEscToClose（DetailScreen）が document.addEventListener で
  // 購読しているため。container 上のリスナは React の event delegation も同じノードで
  // 動くため stopPropagation の効果を観測できない。
  const onConfirm = vi.fn();
  const docHandler = vi.fn();
  document.addEventListener("keydown", docHandler);
  try {
    mount({ body: "abc", onConfirm });
    clickDisplay();
    setTextareaValue("変換中");
    pressKeyOn(requireTextarea(), "Enter", {
      metaKey: true,
      isComposing: true,
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(docHandler).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", docHandler);
  }
});

test("Cmd+Enter で keydown が document へ伝播しない（stopPropagation）", () => {
  const onConfirm = vi.fn();
  const docHandler = vi.fn();
  document.addEventListener("keydown", docHandler);
  try {
    mount({ body: "abc", onConfirm });
    clickDisplay();
    setTextareaValue("xyz");
    pressKeyOn(requireTextarea(), "Enter", { metaKey: true });
    expect(docHandler).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", docHandler);
  }
});

test("Esc で keydown が document へ伝播しない（stopPropagation）", () => {
  const onConfirm = vi.fn();
  const docHandler = vi.fn();
  document.addEventListener("keydown", docHandler);
  try {
    mount({ body: "abc", onConfirm });
    clickDisplay();
    pressKeyOn(requireTextarea(), "Escape");
    expect(docHandler).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener("keydown", docHandler);
  }
});
