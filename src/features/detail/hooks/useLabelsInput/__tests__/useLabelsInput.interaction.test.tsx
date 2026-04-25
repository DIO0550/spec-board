import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseLabelsInputArgs,
  type UseLabelsInputResult,
  useLabelsInput,
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
 * useLabelsInput の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseLabelsInputArgs & {
    onResult: (r: UseLabelsInputResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useLabelsInput(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、最新の戻り値を取得する。
 * @param args - useLabelsInput の引数
 * @returns latest accessor + rerender 関数
 */
const renderHook = (args: UseLabelsInputArgs) => {
  let latest: UseLabelsInputResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseLabelsInputResult) => {
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
  const rerender = (next: UseLabelsInputArgs) => {
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
    get latest(): UseLabelsInputResult {
      return latest as UseLabelsInputResult;
    },
    rerender,
  };
};

test("初期 state は { kind: 'idle' }", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("startAdding() で adding に遷移", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  expect(probe.latest.state).toEqual({ kind: "adding", input: "" });
});

test("setInput で input が更新される（連続）", () => {
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.startAdding();
  });
  act(() => {
    probe.latest.setInput("foo");
  });
  expect(probe.latest.state).toEqual({ kind: "adding", input: "foo" });
  act(() => {
    probe.latest.setInput("bar");
  });
  expect(probe.latest.state).toEqual({ kind: "adding", input: "bar" });
});

test("cancelAdding() で idle に戻る", () => {
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
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("confirmAdding() 成功で onCommit が trim 値で 1 回呼ばれて idle に戻る", () => {
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
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("confirmAdding() 重複時は onCommit 呼ばれず idle に戻る", () => {
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
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("confirmAdding() 空文字時は onCommit 呼ばれず idle に戻る", () => {
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
  expect(probe.latest.state).toEqual({ kind: "idle" });
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
    probe.latest.handleKeyDown({
      key: "Enter",
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(onCommit).toHaveBeenCalledWith("x");
  expect(probe.latest.state).toEqual({ kind: "idle" });
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
    probe.latest.handleKeyDown({
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
    probe.latest.handleKeyDown({
      key: "Enter",
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  act(() => {
    probe.latest.cancelAdding();
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(probe.latest.state).toEqual({ kind: "idle" });
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
    probe.latest.handleKeyDown({
      key: "Escape",
      preventDefault,
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("idle 中の setInput / confirmAdding / cancelAdding は hook を壊さない", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const onCommit = vi.fn();
  const probe = renderHook({ existingLabels: [], onCommit });
  act(() => {
    probe.latest.setInput("foo");
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
  act(() => {
    probe.latest.confirmAdding();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
  expect(onCommit).not.toHaveBeenCalled();
  act(() => {
    probe.latest.cancelAdding();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});
