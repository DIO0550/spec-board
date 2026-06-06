import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseTaskFormFieldsArgs,
  type UseTaskFormFieldsResult,
  useTaskFormFields,
} from "@/features/task-form/hooks/useTaskFormFields";
import { TITLE_MAX_LENGTH } from "@/features/task-form/lib/fields/title";
import type { TaskFormValues } from "@/features/task-form/types";
import { Task } from "@/types/task";

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
  finalizeLabels: () => [],
  finalizeLinks: () => [],
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

/**
 * テスト用の Task を生成するファクトリ。
 * filePath 以外はデフォルト値で埋める。
 * @param filePath Task の filePath
 * @returns Task インスタンス
 */
const makeTask = (filePath: string): Task =>
  Task.fromPayload({
    id: filePath,
    title: filePath,
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath,
  });

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

test("dispatch title: 入力時は errors.title をクリアするのみ（再 validate しない）", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "" });
  });
  expect(get().state.values.title).toBe("");
  expect(get().state.errors.title).toBeUndefined();
});

test("dispatch title: エラー表示中に値を変えると errors.title が undefined になる", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(get().state.errors.title?.code).toBe("EMPTY");
  act(() => {
    get().dispatch({ type: "title", value: "abc" });
  });
  expect(get().state.errors.title).toBeUndefined();
});

test("handleSubmit: 空タイトルでは onSubmit を呼ばず errors.title.code = EMPTY", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("EMPTY");
});

test("handleSubmit: 空白のみタイトルでも EMPTY エラー", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "   " });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("EMPTY");
});

test("handleSubmit: TOO_LONG（TITLE_MAX_LENGTH + 1 文字）", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({
      type: "title",
      value: "a".repeat(TITLE_MAX_LENGTH + 1),
    });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("TOO_LONG");
});

test("handleSubmit: FORBIDDEN_CHAR", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "a<b" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("FORBIDDEN_CHAR");
});

test("handleSubmit DUPLICATE: parent なし → tasks/ 直下の既存タスクと一致", () => {
  const onSubmit = vi.fn();
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    existingTasks: [makeTask("tasks/fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("DUPLICATE");
});

test("handleSubmit DUPLICATE: parent あり → 親 dirname スコープで判定", () => {
  const onSubmit = vi.fn();
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    parentFieldVisible: true,
    initialParent: "tasks/parent/parent.md",
    existingTasks: [makeTask("tasks/parent/fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("DUPLICATE");
});

test("handleSubmit DUPLICATE スコープ外: parent なしで他 dirname にだけ同名 → 重複扱いしない", () => {
  const onSubmit = vi.fn();
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    existingTasks: [makeTask("tasks/parent/fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(get().state.errors.title).toBeUndefined();
});

test("handleSubmit DUPLICATE: parent が bare filename のときは tasks/ 直下と比較する", () => {
  const onSubmit = vi.fn();
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    parentFieldVisible: true,
    initialParent: "parent.md",
    existingTasks: [makeTask("tasks/fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("DUPLICATE");
});

test("handleSubmit DUPLICATE: Windows パス区切り (\\) でも検出される", () => {
  const onSubmit = vi.fn();
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    existingTasks: [makeTask("tasks\\fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.title?.code).toBe("DUPLICATE");
});

test("handleSubmit: 直前の DUPLICATE エラーが残った状態でも、再 submit が Ok なら errors.title をクリアする", () => {
  const onSubmit = vi.fn();
  let tasks: readonly Task[] = [makeTask("tasks/fix-login-bug.md")];
  const Wrapper = (
    props: Omit<UseTaskFormFieldsArgs, "existingTasks"> & {
      existingTasks: readonly Task[];
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
  let latest: UseTaskFormFieldsResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const renderWith = (current: readonly Task[]) => {
    act(() => {
      root?.render(
        createElement(Wrapper, {
          initialStatus: "Todo",
          parentFieldVisible: false,
          isSubmitting: false,
          onSubmit,
          finalizeLabels: () => [],
          finalizeLinks: () => [],
          existingTasks: current,
          onResult: (r) => {
            latest = r;
          },
        }),
      );
    });
  };
  renderWith(tasks);
  const get = () => latest as unknown as UseTaskFormFieldsResult;

  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(get().state.errors.title?.code).toBe("DUPLICATE");
  expect(onSubmit).not.toHaveBeenCalled();

  tasks = [];
  renderWith(tasks);
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(get().state.errors.title).toBeUndefined();
  expect(onSubmit).toHaveBeenCalledTimes(1);
});

test("入力中は重複判定しない（onChange で重複 title を入力しても errors.title は undefined）", () => {
  const { get } = render({
    ...defaultArgs(),
    existingTasks: [makeTask("tasks/fix-login-bug.md")],
  });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  expect(get().state.errors.title).toBeUndefined();
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
    finalizeLabels: commit,
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
    links: [],
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

test("handleSubmit: labels は finalizeLabels の戻り値が使われる", () => {
  const onSubmit = vi.fn();
  const commit = vi.fn(() => ["a", "b"]);
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    finalizeLabels: commit,
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

test("handleSubmit: links は finalizeLinks の戻り値が使われる", () => {
  const onSubmit = vi.fn();
  const finalize = vi.fn(() => ["tasks/a.md", "tasks/b.md"]);
  const { get } = render({
    ...defaultArgs(),
    onSubmit,
    finalizeLinks: finalize,
  });
  act(() => {
    get().dispatch({ type: "title", value: "t" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(finalize).toHaveBeenCalledTimes(1);
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.links).toEqual(["tasks/a.md", "tasks/b.md"]);
});
