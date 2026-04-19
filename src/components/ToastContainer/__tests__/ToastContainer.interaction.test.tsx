import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ToastContainer } from "@/components/ToastContainer";
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

test("ToastContainerは空配列のときは何も描画しない", () => {
  render(
    createElement(ToastContainer, {
      toasts: [],
      onDismiss: vi.fn(),
    }),
  );
  expect(document.querySelector('[data-testid="toast-container"]')).toBeNull();
});

test("複数のトーストがスタック表示される", () => {
  const toasts: ToastItem[] = [
    { id: "a", message: "1件目", type: "success" },
    { id: "b", message: "2件目", type: "error" },
    { id: "c", message: "3件目", type: "warning" },
  ];
  render(
    createElement(ToastContainer, {
      toasts,
      onDismiss: vi.fn(),
    }),
  );
  const containerEl = document.querySelector('[data-testid="toast-container"]');
  expect(containerEl).toBeTruthy();
  const items = containerEl?.querySelectorAll("[data-toast-id]") ?? [];
  expect(items.length).toBe(3);
  expect(items[0].getAttribute("data-toast-id")).toBe("a");
  expect(items[1].getAttribute("data-toast-id")).toBe("b");
  expect(items[2].getAttribute("data-toast-id")).toBe("c");
});
