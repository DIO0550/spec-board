import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ToastContainer } from "@/components/ToastContainer";
// 二重描画回避: 単体テストでは ToastProvider ではなく ToastStateContext / ToastDispatchContext を直接使う。
// （ToastProvider は内部で <ToastContainer /> を内蔵描画するため、ラップすると DOM が重複する）
import {
  type ToastDispatch,
  ToastDispatchContext,
  type ToastState,
  ToastStateContext,
} from "@/providers/ToastProvider/context";
import type { ToastItem } from "@/types/toast";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

/**
 * コンポーネントをレンダリングするヘルパー。
 * @param element - レンダリング対象の React 要素
 */
const render = (element: ReturnType<typeof createElement>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
};

const noopShowToast: ToastDispatch["showToast"] = () => {};

/**
 * ToastContainer 単体テスト用の harness。
 * Provider 内蔵 Container との二重描画を避けるため、ToastStateContext と ToastDispatchContext で
 * 直接値を注入する。
 * @param state - state context に注入する {@link ToastState}
 * @param dispatch - dispatch context に注入する {@link ToastDispatch}
 */
const renderWithContexts = (state: ToastState, dispatch: ToastDispatch) =>
  render(
    createElement(
      ToastDispatchContext.Provider,
      { value: dispatch },
      createElement(
        ToastStateContext.Provider,
        { value: state },
        createElement(ToastContainer),
      ),
    ),
  );

test("Context で toasts 空のときは何も描画しない", () => {
  renderWithContexts(
    { toasts: [] },
    { showToast: noopShowToast, dismissToast: vi.fn() },
  );
  expect(document.querySelector('[data-testid="toast-container"]')).toBeNull();
});

test("Context で toasts 1 件 → container + Toast 1 個 + 文言が描画される", () => {
  const toasts: ToastItem[] = [{ id: "t1", message: "hello", type: "success" }];
  renderWithContexts(
    { toasts },
    { showToast: noopShowToast, dismissToast: vi.fn() },
  );
  const containerEl = document.querySelector('[data-testid="toast-container"]');
  expect(containerEl).toBeTruthy();
  expect(
    containerEl?.querySelectorAll('[data-testid="toast-success"]').length,
  ).toBe(1);
  expect(containerEl?.textContent).toContain("hello");
});

test("Context で toasts 3 件 → 順序通り描画される", () => {
  const toasts: ToastItem[] = [
    { id: "a", message: "1件目", type: "success" },
    { id: "b", message: "2件目", type: "error" },
    { id: "c", message: "3件目", type: "warning" },
  ];
  renderWithContexts(
    { toasts },
    { showToast: noopShowToast, dismissToast: vi.fn() },
  );
  const containerEl = document.querySelector('[data-testid="toast-container"]');
  const items = containerEl?.querySelectorAll("[data-toast-id]") ?? [];
  expect(items.length).toBe(3);
  expect(items[0].getAttribute("data-toast-id")).toBe("a");
  expect(items[1].getAttribute("data-toast-id")).toBe("b");
  expect(items[2].getAttribute("data-toast-id")).toBe("c");
});

test("Toast 自動 dismiss で Context の dismissToast が呼ばれる（onDismiss 配線）", () => {
  const dismissToast = vi.fn();
  const toasts: ToastItem[] = [{ id: "x", message: "auto", type: "success" }];
  renderWithContexts({ toasts }, { showToast: noopShowToast, dismissToast });
  // Toast 既定の duration (3000ms) を経過させて自動 dismiss を発火する。
  act(() => {
    vi.advanceTimersByTime(3001);
  });
  expect(dismissToast).toHaveBeenCalledTimes(1);
  expect(dismissToast.mock.calls[0][0]).toBe("x");
});

test("Context なしで render すると useToasts が throw する", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => {
      render(createElement(ToastContainer));
    }).toThrow(/ToastProvider/);
  } finally {
    errorSpy.mockRestore();
  }
});
