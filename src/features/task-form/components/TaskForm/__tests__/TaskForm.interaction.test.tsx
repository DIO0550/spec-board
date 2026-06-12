import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getLabels, TauriError } from "@/lib/tauri";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import { TaskForm } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getLabels: vi.fn(),
  };
});

const getLabelsMock = vi.mocked(getLabels);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getLabelsMock.mockReset();
  // 既定はラベルマスタ 0 件（従来挙動 = 候補なし）。
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [] }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

const PARENT_CANDIDATES: Task[] = [
  Task.fromPayload({
    id: "p-1",
    title: "親タスクA",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent-a.md",
  }),
];

const render = (props: Parameters<typeof TaskForm>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskForm, props));
  });
};

const changeInputValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitForm = () => {
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

test("タイトル未入力で submit すると onSubmit は呼ばれず、エラーが表示される（結合）", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).not.toHaveBeenCalled();
  const error = document.querySelector('[data-testid="task-form-title-error"]');
  expect(error).toBeTruthy();
  expect(error?.textContent).toContain("タイトル");
});

test("タイトル入力して送信すると onSubmit が正規化値で呼ばれる（priority=undefined 含む）", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "新しいタスク");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(onSubmit.mock.calls[0][0]).toEqual({
    title: "新しいタスク",
    status: "Todo",
    priority: undefined,
    labels: [],
    parent: undefined,
    links: [],
    body: "",
    subIssueTitles: [],
    draft: false,
  });
});

test("ラベル入力中に submit すると未コミット文字が送信値に含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "T");
  });
  act(() => {
    changeInputValue(labelInput, "pending");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].labels).toEqual(["pending"]);
  // finalizeLabels は UI 整合のため commit を dispatch する
  expect(labelInput.value).toBe("");
});

test("initialParent 指定で送信値に parent が含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    initialParent: "tasks/parent-a.md",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "子タスク");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].parent).toBe("tasks/parent-a.md");
});

test("parentCandidates 指定 + initialParent 未指定で送信すると parent は undefined", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    parentCandidates: PARENT_CANDIDATES,
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "T");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].parent).toBeUndefined();
});

test("isSubmitting=true で代表的な入力欄・送信ボタンが一括で無効化される（結合）", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    isSubmitting: true,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const statusChip = document.querySelector(
    '[data-testid="task-form-status"] [role="radio"]',
  ) as HTMLButtonElement;
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  const body = document.querySelector(
    '[data-testid="task-form-body"]',
  ) as HTMLTextAreaElement;
  expect(title.disabled).toBe(true);
  expect(statusChip.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
  expect(cancel.disabled).toBe(true);
  expect(labelInput.disabled).toBe(true);
  expect(body.disabled).toBe(true);
});

test("キャンセルボタン click で親の onCancel が呼ばれる（結合）", () => {
  const onCancel = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel,
  });
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  act(() => {
    cancel.click();
  });
  expect(onCancel).toHaveBeenCalledTimes(1);
});

const lastValues = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls[fn.mock.calls.length - 1][0];

test("onValuesChange は mount 直後に初期値を一度通知する", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  expect(onValuesChange).toHaveBeenCalled();
  expect(onValuesChange.mock.calls[0][0]).toEqual({
    title: "",
    status: "Todo",
    priority: "",
    parent: "",
    body: "",
    labels: [],
    links: [],
    due: "",
    draft: false,
  });
});

test("title 入力で onValuesChange に最新 title が通知される", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "新タイトル");
  });
  expect(lastValues(onValuesChange).title).toBe("新タイトル");
});

test("ラベル確定（Enter）で onValuesChange の labels に反映される", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(labelInput, "bug");
  });
  act(() => {
    labelInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(lastValues(onValuesChange).labels).toEqual(["bug"]);
});

test("未コミットの labelInput も onValuesChange の labels に含まれる（送信時 finalize と一致）", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(labelInput, "pending");
  });
  expect(lastValues(onValuesChange).labels).toEqual(["pending"]);
});

test("links 追加で onValuesChange の links に反映される", () => {
  const onValuesChange = vi.fn();
  const candidate = Task.fromPayload({
    id: "c-1",
    title: "候補タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/candidate.md",
  });
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    existingTasks: [candidate],
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const input = document.querySelector(
    '[data-testid="task-form-links-input"]',
  ) as HTMLInputElement;
  act(() => {
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  });
  const option = document.querySelector(
    '[data-testid="task-form-links-option-c-1"]',
  ) as HTMLElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  expect(lastValues(onValuesChange).links).toEqual(["tasks/candidate.md"]);
});

test("値変化時にフィールド state が保持される（key 再 mount しない）", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  // 未コミットの labelInput を入れた状態で別フィールド（title）を変える。
  // key 再 mount されると labelInput が初期化されてしまう。
  act(() => {
    changeInputValue(labelInput, "draft");
  });
  act(() => {
    changeInputValue(title, "X");
  });
  expect(labelInput.value).toBe("draft");
});

test("title 入力でファイル名欄に kebab-case 値が表示される（自動追従）", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "Fix Login Bug");
  });
  const fileName = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  expect(fileName.value).toBe("fix-login-bug");
});

test("isSubmitting=true でファイル名欄も無効化される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    isSubmitting: true,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const fileName = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  expect(fileName.disabled).toBe(true);
});

test("ファイル名に予約文字を入力して submit するとブロックされエラーが表示される", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const fileName = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "Valid Title");
  });
  act(() => {
    changeInputValue(fileName, "a:b");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).not.toHaveBeenCalled();
  const errorEl = document.querySelector(
    '[data-testid="task-form-file-name-error"]',
  );
  expect(errorEl?.textContent).toContain(
    "ファイル名に使用できない文字が含まれています",
  );
  expect(fileName.getAttribute("aria-invalid")).toBe("true");
  expect(fileName.getAttribute("aria-describedby")).toBe(errorEl?.id);
});

test("期限を入力して送信すると onSubmit の値に due が含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const due = document.querySelector(
    '[data-testid="task-form-due"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "Due Task");
  });
  act(() => {
    changeInputValue(due, "2026-07-01");
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0][0].due).toBe("2026-07-01");
});

test("isSubmitting=true で期限欄も無効化される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    isSubmitting: true,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const due = document.querySelector(
    '[data-testid="task-form-due"]',
  ) as HTMLInputElement;
  expect(due.disabled).toBe(true);
});

test("サブIssue の違反行で submit すると行番号付きエラーが表示されブロックされる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const subIssues = document.querySelector(
    '[data-testid="task-form-sub-issues"]',
  ) as HTMLTextAreaElement;
  act(() => {
    changeInputValue(title, "Valid Title");
  });
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(subIssues, "ok\nbad:title");
    subIssues.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).not.toHaveBeenCalled();
  const errorEl = document.querySelector(
    '[data-testid="task-form-sub-issues-error"]',
  );
  expect(errorEl?.textContent).toContain("2 行目:");
  expect(subIssues.getAttribute("aria-invalid")).toBe("true");
  expect(subIssues.getAttribute("aria-describedby")).toBe(errorEl?.id);
});

test("下書きチェック ON で送信すると onSubmit の値に draft: true が含まれる", () => {
  const onSubmit = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit,
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  const checkbox = document.querySelector(
    '[data-testid="task-form-draft"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "Draft Task");
  });
  act(() => {
    checkbox.click();
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0][0].draft).toBe(true);
});

test("isSubmitting=true で下書きチェックボックスも無効化される", () => {
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    isSubmitting: true,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const checkbox = document.querySelector(
    '[data-testid="task-form-draft"]',
  ) as HTMLInputElement;
  expect(checkbox.disabled).toBe(true);
});

test("getLabels の候補がラベル入力のサジェストへ配線される（結合）", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({ labels: [{ name: "bug" }, { name: "feature" }] }),
  );
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  await act(async () => {
    await Promise.resolve();
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    labelInput.focus();
    labelInput.dispatchEvent(new Event("focus", { bubbles: true }));
  });
  const options = Array.from(
    document.querySelectorAll(
      '[data-testid="task-form-label-suggest"] [role="option"]',
    ),
  );
  expect(options.map((o) => o.textContent)).toEqual(["bug", "feature"]);
});

test("getLabels が失敗しても候補なしの従来挙動になる（結合）", async () => {
  getLabelsMock.mockResolvedValue(Result.err(TauriError.from("読み込み失敗")));
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  await act(async () => {
    await Promise.resolve();
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    labelInput.focus();
    labelInput.dispatchEvent(new Event("focus", { bubbles: true }));
  });
  expect(
    document.querySelector('[data-testid="task-form-label-suggest"]'),
  ).toBeNull();
});

test("候補のクリック確定でラベルチップが追加され入力がクリアされる（結合）", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [{ name: "bug" }] }));
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  await act(async () => {
    await Promise.resolve();
  });
  const labelInput = document.querySelector(
    '[data-testid="task-form-label-input"]',
  ) as HTMLInputElement;
  act(() => {
    labelInput.focus();
    labelInput.dispatchEvent(new Event("focus", { bubbles: true }));
  });
  const option = document.querySelector(
    '[data-testid="task-form-label-suggest-option-bug"]',
  ) as HTMLButtonElement;
  act(() => {
    option.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  expect(
    document.querySelector('[aria-label="ラベル「bug」を削除"]'),
  ).toBeTruthy();
  expect(labelInput.value).toBe("");
});

test("onDirtyChange は boolean 反転時のみ呼ばれる（title 3 文字連続入力で true 通知は 1 回）", () => {
  const onDirtyChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onDirtyChange,
  });
  // mount 直後に初期状態（false）が一度通知される。
  expect(onDirtyChange).toHaveBeenCalledTimes(1);
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(title, "a");
  });
  act(() => {
    changeInputValue(title, "ab");
  });
  act(() => {
    changeInputValue(title, "abc");
  });
  expect(onDirtyChange).toHaveBeenCalledTimes(2);
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  act(() => {
    changeInputValue(title, "");
  });
  expect(onDirtyChange).toHaveBeenCalledTimes(3);
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

test("formRef に form 要素が配線される", () => {
  const formRef = { current: null as HTMLFormElement | null };
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    formRef,
  });
  expect(formRef.current).toBe(
    document.querySelector('[data-testid="task-form"]'),
  );
});
