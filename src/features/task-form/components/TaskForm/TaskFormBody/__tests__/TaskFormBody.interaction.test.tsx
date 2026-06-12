import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskFormBody } from "..";

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

const render = (props: Parameters<typeof TaskFormBody>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormBody, props));
  });
};

test("textarea が描画され value が反映される", () => {
  render({ value: "hello", onChange: vi.fn(), disabled: false });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  expect(ta).toBeTruthy();
  expect(ta.value).toBe("hello");
});

test("入力で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "", onChange, disabled: false });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(ta, "new");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("new");
});

test("disabled=true で textarea が disabled", () => {
  render({ value: "", onChange: vi.fn(), disabled: true });
  const ta = container?.querySelector(
    "[data-testid='task-form-body']",
  ) as HTMLTextAreaElement;
  expect(ta.disabled).toBe(true);
});

const textarea = (): HTMLTextAreaElement =>
  document.querySelector("[data-testid='task-form-body']") as HTMLTextAreaElement;

test("範囲選択して太字ボタンを押すと onChange に装飾済み全文が渡る", () => {
  const onChange = vi.fn();
  render({ value: "hello world", onChange, disabled: false });
  const ta = textarea();
  act(() => {
    ta.setSelectionRange(6, 11);
  });
  const bold = document.querySelector(
    "[data-testid='task-form-md-toolbar-bold']",
  ) as HTMLButtonElement;
  act(() => {
    bold.click();
  });
  expect(onChange).toHaveBeenCalledWith("hello **world**");
});

test("選択なしで見出しボタンを押すとカーソル行の行頭に ## 付きの全文で onChange が呼ばれる", () => {
  const onChange = vi.fn();
  render({ value: "first\nsecond", onChange, disabled: false });
  const ta = textarea();
  act(() => {
    ta.setSelectionRange(8, 8);
  });
  const heading = document.querySelector(
    "[data-testid='task-form-md-toolbar-heading']",
  ) as HTMLButtonElement;
  act(() => {
    heading.click();
  });
  expect(onChange).toHaveBeenCalledWith("first\n## second");
});

test("value 反映後に selectionStart/End が装飾の内側へ復元される", () => {
  // controlled textarea を再現するため value を state 的に差し替えながら再レンダーする。
  const props = {
    value: "hello world",
    onChange: (next: string) => {
      props.value = next;
      act(() => {
        root?.render(createElement(TaskFormBody, props));
      });
    },
    disabled: false,
  };
  render(props);
  const ta = textarea();
  act(() => {
    ta.setSelectionRange(6, 11);
  });
  const bold = document.querySelector(
    "[data-testid='task-form-md-toolbar-bold']",
  ) as HTMLButtonElement;
  act(() => {
    bold.click();
  });
  expect(ta.value).toBe("hello **world**");
  expect(ta.selectionStart).toBe(8);
  expect(ta.selectionEnd).toBe(13);
});

test("disabled 中はツールバーのクリックで onChange が呼ばれない", () => {
  const onChange = vi.fn();
  render({ value: "hello", onChange, disabled: true });
  const bold = document.querySelector(
    "[data-testid='task-form-md-toolbar-bold']",
  ) as HTMLButtonElement;
  act(() => {
    bold.click();
  });
  expect(onChange).not.toHaveBeenCalled();
});
