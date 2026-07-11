import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type ColumnNameInputFieldProps,
  type UseInlineColumnNameInputArgs,
  type UseInlineColumnNameInputResult,
  useInlineColumnNameInput,
} from "..";

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
 * useInlineColumnNameInput の戻り値を公開しつつ、getInputProps().ref を
 * 実際の input 要素に配線するテスト用コンポーネント（focus/select 検証用）。
 * @param props - hook 引数 + 観測コールバック
 * @returns input 要素
 */
const Probe = (
  props: UseInlineColumnNameInputArgs & {
    onResult: (r: UseInlineColumnNameInputResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useInlineColumnNameInput(args);
  useEffect(() => {
    onResult(result);
  });
  return createElement("input", result.getInputProps());
};

/**
 * Probe をマウントし、最新の戻り値と input 要素を取得する。
 * @param args - useInlineColumnNameInput の引数
 * @returns latest accessor + input 要素取得
 */
const renderHook = (args: UseInlineColumnNameInputArgs) => {
  let latest: UseInlineColumnNameInputResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseInlineColumnNameInputResult) => {
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
  return {
    get latest(): UseInlineColumnNameInputResult {
      return latest as UseInlineColumnNameInputResult;
    },
    get input(): HTMLInputElement {
      return container?.querySelector("input") as HTMLInputElement;
    },
  };
};

/**
 * KeyboardEvent スタブを作る（isComposing も指定可能）。
 * @param key - キー名
 * @param isComposing - IME 変換中か
 * @returns preventDefault / stopPropagation スパイ付きの疑似イベント
 */
const makeKeyEvent = (key: string, isComposing = false) => {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    key,
    preventDefault,
    stopPropagation,
    nativeEvent: { isComposing },
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
  return { event, preventDefault, stopPropagation };
};

/**
 * 編集開始して input に値を入れる。
 * @param probe - renderHook の戻り値
 * @param value - 設定する値
 */
const startAndType = (
  probe: { latest: UseInlineColumnNameInputResult },
  value: string,
) => {
  act(() => {
    probe.latest.startEditing();
  });
  act(() => {
    probe.latest.getInputProps().onChange({
      target: { value },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
};

test("Enter で confirm が走り preventDefault/stopPropagation が呼ばれる", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({ initialValue: "", existingNames: [], onCommit });
  startAndType(probe, "Review");
  const { event, preventDefault, stopPropagation } = makeKeyEvent("Enter");
  await act(async () => {
    probe.latest.getInputProps().onKeyDown(event);
    await Promise.resolve();
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(stopPropagation).toHaveBeenCalled();
  expect(onCommit).toHaveBeenCalledWith("Review");
});

test("IME 変換中（isComposing=true）の Enter は confirm を呼ばない", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({ initialValue: "", existingNames: [], onCommit });
  startAndType(probe, "Review");
  const { event, preventDefault } = makeKeyEvent("Enter", true);
  await act(async () => {
    probe.latest.getInputProps().onKeyDown(event);
    await Promise.resolve();
  });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});

test("Escape で cancel（isEditing=false・値が initialValue に戻る）", () => {
  const probe = renderHook({
    initialValue: "Todo",
    existingNames: [],
    onCommit: vi.fn(),
  });
  startAndType(probe, "Changed");
  const { event, preventDefault } = makeKeyEvent("Escape");
  act(() => {
    probe.latest.getInputProps().onKeyDown(event);
  });
  expect(preventDefault).toHaveBeenCalled();
  expect(probe.latest.isEditing).toBe(false);
  act(() => {
    probe.latest.startEditing();
  });
  expect(probe.latest.getInputProps().value).toBe("Todo");
});

test("通常 blur で cancel される（isEditing=false）", () => {
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit: vi.fn(),
  });
  startAndType(probe, "途中入力");
  act(() => {
    probe.latest.getInputProps().onBlur();
  });
  expect(probe.latest.isEditing).toBe(false);
});

test("busy 中の blur は無視され isEditing 維持", async () => {
  let resolveCommit!: () => void;
  const onCommit = vi.fn().mockImplementation(
    () =>
      new Promise<void>((res) => {
        resolveCommit = res;
      }),
  );
  const probe = renderHook({ initialValue: "", existingNames: [], onCommit });
  startAndType(probe, "Review");
  await act(async () => {
    void probe.latest.confirm();
    await Promise.resolve();
  });
  // busy 中 blur
  act(() => {
    probe.latest.getInputProps().onBlur();
  });
  expect(probe.latest.isEditing).toBe(true);
  await act(async () => {
    resolveCommit();
    await Promise.resolve();
  });
});

test("Enter/Esc 直後の blur は cancel スキップ、次の blur では cancel が走る（2 段）", () => {
  const probe = renderHook({
    initialValue: "Todo",
    existingNames: [],
    onCommit: vi.fn(),
  });
  startAndType(probe, "Changed");
  // Escape で cancel → isCancelledRef=true。その直後の blur は cancel スキップ。
  const { event } = makeKeyEvent("Escape");
  act(() => {
    probe.latest.getInputProps().onKeyDown(event);
  });
  // 再度編集開始してから、cancel 経由で isCancelledRef を立てる状況を再現
  act(() => {
    probe.latest.startEditing();
  });
  act(() => {
    probe.latest.cancel();
  });
  // 1 段目 blur: isCancelledRef=true なので cancel スキップ（isCancelledRef を false 化）
  act(() => {
    probe.latest.startEditing();
  });
  act(() => {
    probe.latest.cancel();
  });
  act(() => {
    probe.latest.getInputProps().onBlur();
  });
  // 2 段目: もう一度編集開始 → blur すると今度は cancel が走る
  act(() => {
    probe.latest.startEditing();
  });
  expect(probe.latest.isEditing).toBe(true);
  act(() => {
    probe.latest.getInputProps().onBlur();
  });
  expect(probe.latest.isEditing).toBe(false);
});

test("selectOnFocus=true で編集開始時に focus と select が呼ばれる", () => {
  const probe = renderHook({
    initialValue: "Todo",
    existingNames: [],
    selectOnFocus: true,
    onCommit: vi.fn(),
  });
  const input = probe.input;
  const focusSpy = vi.spyOn(input, "focus");
  const selectSpy = vi.spyOn(input, "select");
  act(() => {
    probe.latest.startEditing();
  });
  expect(focusSpy).toHaveBeenCalled();
  expect(selectSpy).toHaveBeenCalled();
});

test("selectOnFocus=false では select は呼ばれない（focus のみ）", () => {
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    selectOnFocus: false,
    onCommit: vi.fn(),
  });
  const input = probe.input;
  const focusSpy = vi.spyOn(input, "focus");
  const selectSpy = vi.spyOn(input, "select");
  act(() => {
    probe.latest.startEditing();
  });
  expect(focusSpy).toHaveBeenCalled();
  expect(selectSpy).not.toHaveBeenCalled();
});

test("getInputProps の束: aria-* が isDuplicate に連動し onChange で value 更新", () => {
  const probe = renderHook({
    initialValue: "",
    existingNames: ["Done"],
    onCommit: vi.fn(),
  });
  act(() => {
    probe.latest.startEditing();
  });
  const initial = probe.latest.getInputProps();
  expect(initial["aria-label"]).toBe("カラム名");
  expect(initial["aria-invalid"]).toBe(false);
  expect(initial["aria-describedby"]).toBeUndefined();
  act(() => {
    probe.latest.getInputProps().onChange({
      target: { value: "Done" },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
  const props: ColumnNameInputFieldProps = probe.latest.getInputProps();
  expect(props.value).toBe("Done");
  expect(props["aria-invalid"]).toBe(true);
  expect(props["aria-describedby"]).toBe(probe.latest.errorId);
});
