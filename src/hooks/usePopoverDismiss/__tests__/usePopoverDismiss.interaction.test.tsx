import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UsePopoverDismiss,
  usePopoverDismiss,
} from "@/hooks/usePopoverDismiss";

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

/**
 * usePopoverDismiss をホストするテスト用コンポーネント。
 * container 内に子要素（`inside`）を 1 つ持ち、フック値を外部へ公開する。
 * @param props - フック値とオプションを受け取るコールバック
 * @returns ホスト要素
 */
const Host = ({
  onResult,
  onDismiss,
}: {
  onResult: (result: UsePopoverDismiss) => void;
  onDismiss?: () => void;
}) => {
  const dismiss = usePopoverDismiss({ onDismiss });
  const ref = useRef<HTMLDivElement>(null);
  onResult(dismiss);
  return createElement(
    "div",
    { ref: dismiss.containerRef },
    createElement("span", { ref, "data-testid": "inside" }, "inside"),
  );
};

const render = (onDismiss?: () => void) => {
  let latest: UsePopoverDismiss | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Host, {
        onDismiss,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return () => latest as unknown as UsePopoverDismiss;
};

test("toggleOpen で isOpen が true↔false に反転する", () => {
  const get = render();
  expect(get().isOpen).toBe(false);
  act(() => {
    get().toggleOpen();
  });
  expect(get().isOpen).toBe(true);
  act(() => {
    get().toggleOpen();
  });
  expect(get().isOpen).toBe(false);
});

test("open 中の外側 mousedown で閉じ onDismiss が発火する", () => {
  const onDismiss = vi.fn();
  const get = render(onDismiss);
  act(() => {
    get().open();
  });
  const outside = document.createElement("button");
  document.body.appendChild(outside);
  act(() => {
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(get().isOpen).toBe(false);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  outside.remove();
});

test("open 中の container 内 mousedown では閉じない", () => {
  const onDismiss = vi.fn();
  const get = render(onDismiss);
  act(() => {
    get().open();
  });
  const inside = document.querySelector(
    '[data-testid="inside"]',
  ) as HTMLElement;
  act(() => {
    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  expect(get().isOpen).toBe(true);
  expect(onDismiss).not.toHaveBeenCalled();
});

test("open 中の Esc は capture で捕捉され閉じ、親の keydown へ伝播しない", () => {
  const parentKeyDown = vi.fn();
  document.addEventListener("keydown", parentKeyDown);
  const get = render();
  act(() => {
    get().open();
  });
  const inside = document.querySelector(
    '[data-testid="inside"]',
  ) as HTMLElement;
  act(() => {
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(get().isOpen).toBe(false);
  // capture フェーズで stopPropagation するため bubble の親ハンドラへ到達しない。
  expect(parentKeyDown).not.toHaveBeenCalled();
  document.removeEventListener("keydown", parentKeyDown);
});

test("close 中の Esc には反応しない（リスナー未登録で親へ通す）", () => {
  const parentKeyDown = vi.fn();
  document.addEventListener("keydown", parentKeyDown);
  const get = render();
  const inside = document.querySelector(
    '[data-testid="inside"]',
  ) as HTMLElement;
  act(() => {
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(get().isOpen).toBe(false);
  // 閉じている間はフックがリスナーを張らないため、親ハンドラへ通常どおり伝播する。
  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  document.removeEventListener("keydown", parentKeyDown);
});

test("unmount 後は document へ mousedown/keydown リスナーが残らない", () => {
  const onDismiss = vi.fn();
  const get = render(onDismiss);
  act(() => {
    get().open();
  });
  act(() => {
    root?.unmount();
  });
  root = null;
  const outside = document.createElement("button");
  document.body.appendChild(outside);
  act(() => {
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(onDismiss).not.toHaveBeenCalled();
  outside.remove();
});
