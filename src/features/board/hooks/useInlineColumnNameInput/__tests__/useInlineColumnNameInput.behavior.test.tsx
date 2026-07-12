import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
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
 * useInlineColumnNameInput の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
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
  return null;
};

/**
 * Probe をマウントし、最新の戻り値を取得する。
 * @param args - useInlineColumnNameInput の引数
 * @returns latest accessor
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
  };
};

/**
 * 編集開始してから input 値を設定する。
 * @param probe - renderHook の戻り値
 * @param value - 設定する input 値
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

test("初期状態は非編集（isEditing=false / isDuplicate=false）", () => {
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit: vi.fn(),
  });
  expect(probe.latest.isEditing).toBe(false);
  expect(probe.latest.isDuplicate).toBe(false);
  expect(probe.latest.getInputProps().disabled).toBe(false);
});

test("startEditing で編集中（isEditing=true・value=initialValue）に遷移", () => {
  const probe = renderHook({
    initialValue: "Todo",
    existingNames: [],
    onCommit: vi.fn(),
  });
  act(() => {
    probe.latest.startEditing();
  });
  expect(probe.latest.isEditing).toBe(true);
  expect(probe.latest.getInputProps().value).toBe("Todo");
});

test("cancel 後に再度 startEditing で initialValue に戻り再編集できる", () => {
  const probe = renderHook({
    initialValue: "Todo",
    existingNames: [],
    onCommit: vi.fn(),
  });
  startAndType(probe, "変更中");
  act(() => {
    probe.latest.cancel();
  });
  expect(probe.latest.isEditing).toBe(false);
  act(() => {
    probe.latest.startEditing();
  });
  expect(probe.latest.isEditing).toBe(true);
  expect(probe.latest.getInputProps().value).toBe("Todo");
});

test("有効入力の confirm で onCommit が trim 値で 1 回呼ばれ isEditing=false に戻る", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({
    initialValue: "",
    existingNames: ["Todo"],
    onCommit,
  });
  startAndType(probe, "  Review  ");
  await act(async () => {
    await probe.latest.confirm();
  });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith("Review");
  expect(probe.latest.isEditing).toBe(false);
});

test("空文字は no-op 成功（onCommit 未呼び出し・isEditing=false・戻り値 true）", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "");
  let returned: boolean | undefined;
  await act(async () => {
    returned = await probe.latest.confirm();
  });
  expect(returned).toBe(true);
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isEditing).toBe(false);
});

test("空白のみ '   ' も trim 後空で no-op 成功", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "   ");
  let returned: boolean | undefined;
  await act(async () => {
    returned = await probe.latest.confirm();
  });
  expect(returned).toBe(true);
  expect(onCommit).not.toHaveBeenCalled();
});

test("同期 onCommit（undefined 返し）でも確定して isEditing=false", async () => {
  const onCommit = vi.fn().mockReturnValue(undefined);
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "Review");
  await act(async () => {
    await probe.latest.confirm();
  });
  expect(onCommit).toHaveBeenCalledWith("Review");
  expect(probe.latest.isEditing).toBe(false);
});

test("currentName 指定時に自己名一致は no-op 成功（onCommit 未呼び出し）", async () => {
  const onCommit = vi.fn();
  const probe = renderHook({
    initialValue: "Todo",
    currentName: "Todo",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "Todo");
  let returned: boolean | undefined;
  await act(async () => {
    returned = await probe.latest.confirm();
  });
  expect(returned).toBe(true);
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isEditing).toBe(false);
});

test.each([
  ["配列供給", ["In Progress", "Done"] as readonly string[]],
  ["関数供給", () => ["In Progress", "Done"] as readonly string[]],
])("重複時（%s）は isDuplicate=true・confirm は false・onCommit 未呼び出し・isEditing 維持", async (_label, existingNames) => {
  const onCommit = vi.fn();
  const probe = renderHook({
    initialValue: "",
    existingNames,
    onCommit,
  });
  startAndType(probe, "Done");
  expect(probe.latest.isDuplicate).toBe(true);
  let returned: boolean | undefined;
  await act(async () => {
    returned = await probe.latest.confirm();
  });
  expect(returned).toBe(false);
  expect(onCommit).not.toHaveBeenCalled();
  expect(probe.latest.isEditing).toBe(true);
});

test("currentName 指定時の重複自己除外（自己名は isDuplicate=false）", () => {
  const probe = renderHook({
    initialValue: "Todo",
    currentName: "Todo",
    existingNames: ["Todo", "Done"],
    onCommit: vi.fn(),
  });
  startAndType(probe, "Todo");
  expect(probe.latest.isDuplicate).toBe(false);
});

test("re-entrant guard: busy 中の 2 回目 confirm は false・onCommit 1 回のみ", async () => {
  let resolveCommit!: () => void;
  const onCommit = vi.fn().mockImplementation(
    () =>
      new Promise<void>((res) => {
        resolveCommit = res;
      }),
  );
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "Review");
  let secondReturn: boolean | undefined;
  await act(async () => {
    // 1 回目（pending のまま busy 化）
    void probe.latest.confirm();
    await Promise.resolve();
  });
  await act(async () => {
    // 2 回目（busy guard で false）
    secondReturn = await probe.latest.confirm();
  });
  expect(secondReturn).toBe(false);
  expect(onCommit).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveCommit();
    await Promise.resolve();
  });
});

test("reject 時は isBusy=false に戻り isEditing 維持・inputValue 保持", async () => {
  const onCommit = vi.fn().mockRejectedValue(new Error("backend reject"));
  const probe = renderHook({
    initialValue: "",
    existingNames: [],
    onCommit,
  });
  startAndType(probe, "Review");
  let returned: boolean | undefined;
  await act(async () => {
    returned = await probe.latest.confirm();
  });
  expect(returned).toBe(false);
  expect(probe.latest.isEditing).toBe(true);
  expect(probe.latest.getInputProps().disabled).toBe(false);
  expect(probe.latest.getInputProps().value).toBe("Review");
});
