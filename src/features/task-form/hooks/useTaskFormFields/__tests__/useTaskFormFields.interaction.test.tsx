import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseTaskFormFieldsArgs,
  type UseTaskFormFieldsResult,
  useTaskFormFields,
} from "@/features/task-form/hooks/useTaskFormFields";
import type { TaskFormValues } from "@/features/task-form/types";

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
 * useTaskFormFields の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック引数とコールバック
 * @returns null
 */
const Probe = (
  props: UseTaskFormFieldsArgs & {
    onResult: (r: UseTaskFormFieldsResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useTaskFormFields(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const defaultArgs = (): UseTaskFormFieldsArgs => ({
  initialStatus: "Todo",
  parentFieldVisible: false,
  isSubmitting: false,
  onSubmit: vi.fn(),
  commitPendingAndGetLabels: () => [],
});

const render = (args: UseTaskFormFieldsArgs) => {
  let latest: UseTaskFormFieldsResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        ...args,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return { get: () => latest as unknown as UseTaskFormFieldsResult };
};

const makeFormEvent = () =>
  ({
    preventDefault: vi.fn(),
  }) as unknown as React.FormEvent<HTMLFormElement>;

test("初期 state: values はデフォルト、errors は空、parent は visible=false で undefined", () => {
  const { get } = render(defaultArgs());
  expect(get().state.values).toEqual({
    title: "",
    status: "Todo",
    priority: "",
    parent: undefined,
    body: "",
  });
  expect(get().state.errors).toEqual({});
});

test("parentFieldVisible=true + initialParent が初期 state に反映される", () => {
  const { get } = render({
    ...defaultArgs(),
    parentFieldVisible: true,
    initialParent: "tasks/p-1.md",
  });
  expect(get().state.values.parent).toBe("tasks/p-1.md");
});

test("dispatch title（空）: values.title と errors.title が同時更新される", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "" });
  });
  expect(get().state.values.title).toBe("");
  expect(get().state.errors.title).toBe("タイトルを入力してください");
});

test("dispatch title（有効）: errors.title が undefined に戻る", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "" });
  });
  expect(get().state.errors.title).toBe("タイトルを入力してください");
  act(() => {
    get().dispatch({ type: "title", value: "abc" });
  });
  expect(get().state.errors.title).toBeUndefined();
});

test("dispatch validateAll: 現在の values を再検証して errors を更新する", () => {
  const { get } = render(defaultArgs());
  expect(get().state.errors.title).toBeUndefined();
  act(() => {
    get().dispatch({ type: "validateAll" });
  });
  expect(get().state.errors.title).toBe("タイトルを入力してください");
});

test("handleSubmit: 空タイトルでは onSubmit を呼ばず errors.title をセット", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title).toBe("タイトルを入力してください");
});

test("handleSubmit: 空白のみタイトルでも errors.title がセットされる", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "   " });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title).toBe("タイトルを入力してください");
});

test("handleSubmit: isSubmitting=true では何もしない", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), isSubmitting: true, onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "abc" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
});

test("handleSubmit 正常系: 正規化された値が onSubmit に渡る", () => {
  const onSubmit = vi.fn();
  const commit = vi.fn(() => [] as string[]);
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    commitPendingAndGetLabels: commit,
  });
  act(() => {
    get().dispatch({ type: "title", value: "  t  " });
  });
  act(() => {
    get().dispatch({ type: "status", value: "Todo" });
  });
  act(() => {
    get().dispatch({ type: "priority", value: "High" });
  });
  act(() => {
    get().dispatch({ type: "body", value: "b" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values).toEqual({
    title: "t",
    status: "Todo",
    priority: "High",
    labels: [],
    parent: undefined,
    body: "b",
  });
});

test('handleSubmit: priority="" は undefined に正規化される', () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "t" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.priority).toBeUndefined();
});

test("handleSubmit: labels は commitPendingAndGetLabels の戻り値が使われる", () => {
  const onSubmit = vi.fn();
  const commit = vi.fn(() => ["a", "b"]);
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    commitPendingAndGetLabels: commit,
  });
  act(() => {
    get().dispatch({ type: "title", value: "t" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(commit).toHaveBeenCalledTimes(1);
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.labels).toEqual(["a", "b"]);
});
