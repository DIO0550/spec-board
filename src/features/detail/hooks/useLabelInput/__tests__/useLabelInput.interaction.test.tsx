import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseLabelInputArgs,
  type UseLabelInputResult,
  useLabelInput,
} from "../index";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

/**
 * useLabelInput の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseLabelInputArgs & {
    onResult: (r: UseLabelInputResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useLabelInput(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、最新の戻り値を取得する。
 * @param args - useLabelInput の引数
 * @returns latest accessor + rerender 関数
 */
const renderHook = (args: UseLabelInputArgs) => {
  let latest: UseLabelInputResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseLabelInputResult) => {
    latest = r;
  };
  act(() => {
    root?.render(
      createElement(Probe, {
        ...args,
        onResult: handleResult,
      }),
    );
  });
  const rerender = (next: UseLabelInputArgs) => {
    act(() => {
      root?.render(
        createElement(Probe, {
          ...next,
          onResult: handleResult,
        }),
      );
    });
  };
  return {
    get latest(): UseLabelInputResult {
      return latest as UseLabelInputResult;
    },
    rerender,
  };
};

test("初期状態は非追加（isAdding=false / inputValue=''）", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  expect(probe.latest.isAdding).toBe(false);
  expect(probe.latest.inputValue).toBe("");
});

test("startAdding() で追加中（isAdding=true / inputValue=''）に遷移", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  expect(probe.latest.isAdding).toBe(true);
  expect(probe.latest.inputValue).toBe("");
});

test("setInput で inputValue が更新される（連続）", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("foo");
  });
  expect(probe.latest.inputValue).toBe("foo");
  act(() => {
    probe.latest.setInput("bar");
  });
  expect(probe.latest.inputValue).toBe("bar");
});

test("cancelAdding() で非追加（isAdding=false）に戻る", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("foo");
  });
  act(() => {
    probe.latest.cancelAdding();
  });
  expect(probe.latest.isAdding).toBe(false);
});

test("confirmAdding() 成功で onCommit が trim 値で 1 回呼ばれて非追加に戻る", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: ["a"], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("  foo  ");
  });
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith("foo");
  expect(probe.latest.isAdding).toBe(false);
});

test("confirmAdding() 重複時は onCommit 呼ばれず非追加に戻る", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: ["a"], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("a");
  });
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isAdding).toBe(false);
});

test("confirmAdding() 空文字時は onCommit 呼ばれず非追加に戻る", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("   ");
  });
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isAdding).toBe(false);
});

test("Enter キーで confirmAdding が走る", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("x");
  });
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  act(() => {
    probe.latest.commitOrCancelOnKey({
      key: "Enter",
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(onCommit).toHaveBeenCalledWith("x");
  expect(probe.latest.isAdding).toBe(false);
});

test("Enter 後の confirmAdding 再呼び出しは早期 return（onCommit 1 回のみ）", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("x");
  });
  act(() => {
    probe.latest.commitOrCancelOnKey({
      key: "Enter",
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
});

test("Enter 後の cancelAdding は machine no-op で副作用なし", () => {
  const onCommit = vi.fn();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("x");
  });
  act(() => {
    probe.latest.commitOrCancelOnKey({
      key: "Enter",
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  act(() => {
    probe.latest.cancelAdding();
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(probe.latest.isAdding).toBe(false);
});

test("Escape キーで cancelAdding が走る（onCommit 呼ばれない）", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("x");
  });
  const preventDefault = vi.fn();
  act(() => {
    probe.latest.commitOrCancelOnKey({
      key: "Escape",
      preventDefault,
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isAdding).toBe(false);
});

test("非追加中の setInput / confirmAdding / cancelAdding は hook を壊さない", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.setInput("foo");
  });
  expect(probe.latest.isAdding).toBe(false);
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(probe.latest.isAdding).toBe(false);
  expect(onCommit).not.toHaveBeenCalled();
  act(() => {
    probe.latest.cancelAdding();
  });
  expect(probe.latest.isAdding).toBe(false);
});
