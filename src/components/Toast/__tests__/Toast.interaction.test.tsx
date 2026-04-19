import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TOAST_DEFAULT_DURATION_MS, Toast } from "@/components/Toast";
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
 * コンポーネントをレンダリングするヘルパー
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

/**
 * テスト用の ToastItem を生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用 ToastItem
 */
const createToast = (overrides: Partial<ToastItem> = {}): ToastItem => ({
  id: "toast-1",
  message: "メッセージ",
  type: "success",
  ...overrides,
});

test("successタイプのトーストが緑系で表示される", () => {
  render(
    createElement(Toast, {
      toast: createToast({ type: "success", message: "保存しました" }),
      onDismiss: vi.fn(),
    }),
  );
  const el = document.querySelector('[data-testid="toast-success"]');
  expect(el).toBeTruthy();
  expect(el?.textContent).toBe("保存しました");
  expect(el?.className).toContain("bg-green-600");
});

test("errorタイプのトーストが赤系で表示されaria-liveがassertive", () => {
  render(
    createElement(Toast, {
      toast: createToast({ type: "error", message: "失敗しました" }),
      onDismiss: vi.fn(),
    }),
  );
  const el = document.querySelector('[data-testid="toast-error"]');
  expect(el).toBeTruthy();
  expect(el?.className).toContain("bg-red-600");
  expect(el?.getAttribute("role")).toBe("alert");
  expect(el?.getAttribute("aria-live")).toBe("assertive");
});

test("warningタイプのトーストが黄系で表示される", () => {
  render(
    createElement(Toast, {
      toast: createToast({ type: "warning", message: "注意" }),
      onDismiss: vi.fn(),
    }),
  );
  const el = document.querySelector('[data-testid="toast-warning"]');
  expect(el).toBeTruthy();
  expect(el?.className).toContain("bg-yellow-500");
});

test("デフォルトで3秒後にonDismissが呼ばれる", () => {
  const onDismiss = vi.fn();
  render(
    createElement(Toast, {
      toast: createToast({ id: "t-auto" }),
      onDismiss,
    }),
  );
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS);
  });
  expect(onDismiss).toHaveBeenCalledWith("t-auto");
});

test("duration指定時はその時間経過後にonDismissが呼ばれる", () => {
  const onDismiss = vi.fn();
  render(
    createElement(Toast, {
      toast: createToast({ id: "t-custom" }),
      onDismiss,
      duration: 500,
    }),
  );
  act(() => {
    vi.advanceTimersByTime(499);
  });
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(onDismiss).toHaveBeenCalledWith("t-custom");
});
