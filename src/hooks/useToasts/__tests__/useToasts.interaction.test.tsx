import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useToasts } from "@/hooks/useToasts";
import type { ToastType, UseToastsResult } from "@/types/toast";

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
 * useToasts フックの戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null（描画は行わない）
 */
const UseToastsProbe = ({
  onResult,
}: {
  onResult: (result: UseToastsResult) => void;
}) => {
  const result = useToasts();
  useEffect(() => {
    onResult(result);
  });
  return null;
};

test("useToasts: showToast でトーストが追加され末尾に積まれる", () => {
  let latest: UseToastsResult | null = null;
  render(
    createElement(UseToastsProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  expect(latest).not.toBeNull();
  const probe = latest as unknown as UseToastsResult;

  act(() => {
    probe.showToast("1件目", "success" satisfies ToastType);
  });
  expect((latest as unknown as UseToastsResult).toasts.length).toBe(1);
  expect((latest as unknown as UseToastsResult).toasts[0].message).toBe(
    "1件目",
  );
  expect((latest as unknown as UseToastsResult).toasts[0].type).toBe("success");

  act(() => {
    (latest as unknown as UseToastsResult).showToast(
      "2件目",
      "error" satisfies ToastType,
    );
  });
  const toasts = (latest as unknown as UseToastsResult).toasts;
  expect(toasts.length).toBe(2);
  expect(toasts[1].message).toBe("2件目");
  expect(toasts[1].type).toBe("error");
});

test("useToasts: showToast は毎回ユニークな ID を生成する", () => {
  let latest: UseToastsResult | null = null;
  render(
    createElement(UseToastsProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  const probe = latest as unknown as UseToastsResult;
  act(() => {
    probe.showToast("a", "success");
    probe.showToast("b", "success");
    probe.showToast("c", "success");
  });
  const ids = (latest as unknown as UseToastsResult).toasts.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("useToasts: dismissToast で指定 ID のみが取り除かれる", () => {
  let latest: UseToastsResult | null = null;
  render(
    createElement(UseToastsProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  const probe = latest as unknown as UseToastsResult;
  act(() => {
    probe.showToast("a", "success");
    probe.showToast("b", "success");
    probe.showToast("c", "success");
  });
  const targetId = (latest as unknown as UseToastsResult).toasts[1].id;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast(targetId);
  });
  const remaining = (latest as unknown as UseToastsResult).toasts;
  expect(remaining.length).toBe(2);
  expect(remaining.some((t) => t.id === targetId)).toBe(false);
  expect(remaining[0].message).toBe("a");
  expect(remaining[1].message).toBe("c");
});

test("useToasts: 存在しない ID の dismissToast は配列に影響しない", () => {
  let latest: UseToastsResult | null = null;
  render(
    createElement(UseToastsProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  const probe = latest as unknown as UseToastsResult;
  act(() => {
    probe.showToast("a", "success");
  });
  const before = (latest as unknown as UseToastsResult).toasts;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast("not-exist");
  });
  const after = (latest as unknown as UseToastsResult).toasts;
  expect(after.length).toBe(before.length);
  expect(after[0].id).toBe(before[0].id);
});
