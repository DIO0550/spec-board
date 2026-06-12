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

test("初期 state: values はデフォルト、errors は空、parent は visible=false で undefined", () => {
  const { get } = render(defaultArgs());
  expect(get().state.values).toEqual({
    title: "",
    fileName: "",
    status: "Todo",
    priority: "",
    parent: undefined,
    body: "",
    due: "",
    subIssues: "",
    draft: false,
  });
  expect(get().state.errors).toEqual({});
  expect(get().state.fileNameDirty).toBe(false);
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

test("dispatch title: ファイル名が kebab-case で自動追従する", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "Fix Bug" });
  });
  expect(get().state.values.fileName).toBe("fix-bug");
  expect(get().state.fileNameDirty).toBe(false);
});

test("dispatch fileName: 手動編集後は title 入力に追従しない", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "fileName", value: "custom" });
  });
  expect(get().state.fileNameDirty).toBe(true);
  act(() => {
    get().dispatch({ type: "title", value: "New Title" });
  });
  expect(get().state.values.fileName).toBe("custom");
});

test("dispatch fileName: 空文字に戻すと追従を再開し現在の title から再同期する", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "First Title" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "custom" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "" });
  });
  expect(get().state.fileNameDirty).toBe(false);
  expect(get().state.values.fileName).toBe("first-title");
  act(() => {
    get().dispatch({ type: "title", value: "Second Title" });
  });
  expect(get().state.values.fileName).toBe("second-title");
});

test("dispatch fileName: 入力値は生のまま保持される（スペース・.md 込みの入力を破壊しない）", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "fileName", value: "my task.md " });
  });
  expect(get().state.values.fileName).toBe("my task.md ");
});

test("handleSubmit: trim + 末尾 .md 剥がしは submit 時に適用される", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "  custom.MD  " });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.fileName).toBe("custom.md");
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

test("handleSubmit: 既存タスクと重複しうるタイトルでも onSubmit が呼ばれる（DUPLICATE 撤廃）", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Login Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(get().state.errors.title).toBeUndefined();
});

test("handleSubmit: 自動追従中（手動未編集）は submit 値に fileName キーが含まれない", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Bug" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect("fileName" in values).toBe(false);
});

test("handleSubmit: 手動編集後は base に .md を付与した完全名が fileName として送信される", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Fix Bug" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "custom-name" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.fileName).toBe("custom-name.md");
});

test("handleSubmit: fileName 予約文字では onSubmit を呼ばず errors.fileName が設定される", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Valid Title" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "a:b" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.fileName).toEqual({
    code: "FORBIDDEN_CHAR",
    chars: [":"],
  });
});

test("dispatch fileName: エラー表示中に再入力すると errors.fileName がクリアされる", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Valid Title" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "a:b" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(get().state.errors.fileName?.code).toBe("FORBIDDEN_CHAR");
  act(() => {
    get().dispatch({ type: "fileName", value: "fixed-name" });
  });
  expect(get().state.errors.fileName).toBeUndefined();
});

test("handleSubmit: fileName エラー解消後の再 submit でエラーがクリアされ送信される", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "Valid Title" });
  });
  act(() => {
    get().dispatch({ type: "fileName", value: "a:b" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  act(() => {
    get().dispatch({ type: "fileName", value: "fixed-name" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(get().state.errors.fileName).toBeUndefined();
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

test("handleSubmit 正常系: 正規化された値が onSubmit に渡る（自動追従中は fileName なし）", () => {
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
    subIssueTitles: [],
    draft: false,
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

test("dispatch due: 値が更新され他 field に影響しない", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "due", value: "2026-07-01" });
  });
  expect(get().state.values.due).toBe("2026-07-01");
  expect(get().state.values.title).toBe("T");
  expect(get().state.values.fileName).toBe("t");
});

test("handleSubmit: due 入力ありのとき submit 値に due が入る", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "due", value: "2026-07-01" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.due).toBe("2026-07-01");
});

test("handleSubmit: due 未入力（空文字）のとき submit 値に due キーが含まれない", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect("due" in values).toBe(false);
});

test("dispatch subIssues: 値が更新され他 field に影響しない", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "subIssues", value: "子1\n子2" });
  });
  expect(get().state.values.subIssues).toBe("子1\n子2");
  expect(get().state.values.title).toBe("");
});

test("handleSubmit: submit 値に正規化済み subIssueTitles が入る（空行無視・trim）", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "subIssues", value: "子1\n\n 子2 " });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.subIssueTitles).toEqual(["子1", "子2"]);
});

test("handleSubmit: サブIssue 違反行では onSubmit を呼ばず errors.subIssues に行番号が入る", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "subIssues", value: "ok\nbad:title" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(get().state.errors.subIssues).toEqual({
    line: 2,
    error: { code: "FORBIDDEN_CHAR", chars: [":"] },
  });
});

test("dispatch subIssues: エラー表示中に再入力すると errors.subIssues がクリアされる", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "subIssues", value: "bad:title" });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  expect(get().state.errors.subIssues?.line).toBe(1);
  act(() => {
    get().dispatch({ type: "subIssues", value: "fixed" });
  });
  expect(get().state.errors.subIssues).toBeUndefined();
});

test("dispatch draft: 値が更新され他 field に影響しない", () => {
  const { get } = render(defaultArgs());
  act(() => {
    get().dispatch({ type: "draft", value: true });
  });
  expect(get().state.values.draft).toBe(true);
  expect(get().state.values.title).toBe("");
});

test("handleSubmit: draft の現在値が submit 値に入る", () => {
  const onSubmit = vi.fn();
  const { get } = render({ ...defaultArgs(), onSubmit });
  act(() => {
    get().dispatch({ type: "title", value: "T" });
  });
  act(() => {
    get().dispatch({ type: "draft", value: true });
  });
  act(() => {
    get().handleSubmit(makeFormEvent());
  });
  const values = onSubmit.mock.calls[0][0] as TaskFormValues;
  expect(values.draft).toBe(true);
});
