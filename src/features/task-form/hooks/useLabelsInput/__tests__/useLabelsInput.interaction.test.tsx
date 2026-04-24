import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseLabelsInputResult,
  useLabelsInput,
} from "@/features/task-form/hooks/useLabelsInput";

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
 * useLabelsInput の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null
 */
const UseLabelsInputProbe = ({
  initialLabels,
  onResult,
}: {
  initialLabels?: string[];
  onResult: (result: UseLabelsInputResult) => void;
}) => {
  const result = useLabelsInput(initialLabels);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const render = (initialLabels?: string[]) => {
  let latest: UseLabelsInputResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(UseLabelsInputProbe, {
        initialLabels,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return () => latest as unknown as UseLabelsInputResult;
};

test('初期 state は { labels: [], labelInput: "" }', () => {
  const get = render();
  expect(get().state).toEqual({ labels: [], labelInput: "" });
});

test("dispatch setInput で labelInput が更新される", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "foo" });
  });
  expect(get().state.labelInput).toBe("foo");
});

test("dispatch commit で trim 済みが labels に追加され labelInput がクリアされる", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "  foo  " });
  });
  act(() => {
    get().dispatch({ type: "commit" });
  });
  expect(get().state).toEqual({ labels: ["foo"], labelInput: "" });
});

test("commit（空 trim）は state を変えない", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "   " });
  });
  const before = get().state;
  act(() => {
    get().dispatch({ type: "commit" });
  });
  expect(get().state).toBe(before);
});

test("commit（重複）は labelInput だけクリア、labels 不変", () => {
  const get = render(["a"]);
  act(() => {
    get().dispatch({ type: "setInput", value: "a" });
  });
  act(() => {
    get().dispatch({ type: "commit" });
  });
  expect(get().state).toEqual({ labels: ["a"], labelInput: "" });
});

test("dispatch remove で指定ラベルが除外される", () => {
  const get = render(["a", "b"]);
  act(() => {
    get().dispatch({ type: "remove", label: "a" });
  });
  expect(get().state.labels).toEqual(["b"]);
});

test("handleKeyDown: Enter で commit + preventDefault", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "x" });
  });
  const prevent = vi.fn();
  act(() => {
    get().handleKeyDown({
      key: "Enter",
      nativeEvent: { isComposing: false },
      preventDefault: prevent,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(prevent).toHaveBeenCalledTimes(1);
  expect(get().state).toEqual({ labels: ["x"], labelInput: "" });
});

test("handleKeyDown: IME 変換中（isComposing=true）の Enter は preventDefault するが commit しない", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "日本語" });
  });
  const prevent = vi.fn();
  const before = get().state;
  act(() => {
    get().handleKeyDown({
      key: "Enter",
      nativeEvent: { isComposing: true },
      preventDefault: prevent,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  // `<form>` 内 input のため IME 変換確定 Enter でも form submit を抑止する必要がある。
  expect(prevent).toHaveBeenCalledTimes(1);
  expect(get().state).toBe(before);
});

test("handleKeyDown: Enter 以外では何もしない", () => {
  const get = render();
  act(() => {
    get().dispatch({ type: "setInput", value: "x" });
  });
  const prevent = vi.fn();
  const before = get().state;
  act(() => {
    get().handleKeyDown({
      key: "Tab",
      preventDefault: prevent,
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  });
  expect(prevent).not.toHaveBeenCalled();
  expect(get().state).toBe(before);
});

test("finalizeLabels: 空 trim は現在の labels を返し state 変更なし", () => {
  const get = render(["a"]);
  act(() => {
    get().dispatch({ type: "setInput", value: "   " });
  });
  const before = get().state;
  let result: string[] = [];
  act(() => {
    result = get().finalizeLabels();
  });
  expect(result).toEqual(["a"]);
  expect(get().state).toBe(before);
});

test("finalizeLabels: 非空かつ重複は戻り値が既存 labels、labelInput は clear される", () => {
  const get = render(["a"]);
  act(() => {
    get().dispatch({ type: "setInput", value: "a" });
  });
  let result: string[] = [];
  act(() => {
    result = get().finalizeLabels();
  });
  expect(result).toEqual(["a"]);
  // UI 整合のため commit が dispatch され labelInput は clear される
  expect(get().state).toEqual({ labels: ["a"], labelInput: "" });
});

test("finalizeLabels: 非空かつ新規は pending を取り込んだ配列を返し state も追従する", () => {
  const get = render(["a"]);
  act(() => {
    get().dispatch({ type: "setInput", value: "b" });
  });
  let result: string[] = [];
  act(() => {
    result = get().finalizeLabels();
  });
  expect(result).toEqual(["a", "b"]);
  expect(get().state).toEqual({ labels: ["a", "b"], labelInput: "" });
});
