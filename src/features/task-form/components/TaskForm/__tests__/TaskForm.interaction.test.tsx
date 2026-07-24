import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getLabels, previewTaskFilename, TauriError } from "@/lib/tauri";
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
    previewTaskFilename: vi.fn(),
  };
});

const getLabelsMock = vi.mocked(getLabels);
const previewMock = vi.mocked(previewTaskFilename);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getLabelsMock.mockReset();
  previewMock.mockReset();
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  previewMock.mockResolvedValue(Result.ok({ kind: "pending" }));
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

const openLabels = () => {
  const trigger = document.querySelector(
    '[data-testid="task-form-labels"]',
  ) as HTMLButtonElement;
  act(() => {
    trigger.click();
  });
};

const typeLabelSearch = (value: string) => {
  const search = document.querySelector(
    '[data-testid="task-form-labels-search"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(search, value);
  });
};

const pressEnterOnLabelSearch = () => {
  const search = document.querySelector(
    '[data-testid="task-form-labels-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
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

test("popover で作成したラベルが送信値に含まれる", () => {
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
    changeInputValue(title, "T");
  });
  openLabels();
  typeLabelSearch("bug");
  pressEnterOnLabelSearch();
  act(() => {
    submitForm();
  });
  expect(onSubmit.mock.calls[0][0].labels).toEqual(["bug"]);
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
  const statusTrigger = document.querySelector(
    '[data-testid="status-field"]',
  ) as HTMLButtonElement;
  const submit = document.querySelector(
    '[data-testid="task-form-submit"]',
  ) as HTMLButtonElement;
  const cancel = document.querySelector(
    '[data-testid="task-form-cancel"]',
  ) as HTMLButtonElement;
  const labelsTrigger = document.querySelector(
    '[data-testid="task-form-labels"]',
  ) as HTMLButtonElement;
  const body = document.querySelector(
    '[data-testid="task-form-body"]',
  ) as HTMLTextAreaElement;
  expect(title.disabled).toBe(true);
  expect(statusTrigger.disabled).toBe(true);
  expect(submit.disabled).toBe(true);
  expect(cancel.disabled).toBe(true);
  expect(labelsTrigger.disabled).toBe(true);
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
    frontmatter: {
      title: "",
      status: "Todo",
      priority: "",
      parent: "",
      labels: [],
      links: [],
      due: "",
      draft: false,
    },
    body: "",
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
  expect(lastValues(onValuesChange).frontmatter.title).toBe("新タイトル");
});

test("popover でラベルを作成すると onValuesChange の labels に反映される", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  openLabels();
  typeLabelSearch("bug");
  pressEnterOnLabelSearch();
  expect(lastValues(onValuesChange).frontmatter.labels).toEqual(["bug"]);
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
  expect(lastValues(onValuesChange).frontmatter.links).toEqual([
    "tasks/candidate.md",
  ]);
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
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  // ラベルを選択した状態で別フィールド（title）を変える。
  // key 再 mount されると選択済みラベルが初期化されてしまう。
  openLabels();
  typeLabelSearch("draft");
  pressEnterOnLabelSearch();
  act(() => {
    changeInputValue(title, "X");
  });
  const trigger = document.querySelector(
    '[data-testid="task-form-labels"]',
  ) as HTMLButtonElement;
  expect(trigger.textContent).toContain("draft");
});

test("title 入力でファイル名欄は空のまま（自動追従は BE IPC に移行）", () => {
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
  expect(fileName.value).toBe("");
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

test("getLabels の候補が popover の option へ配線される（結合）", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({
      labels: [{ name: "bug" }, { name: "feature" }],
      usageCounts: {},
    }),
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
  openLabels();
  const options = Array.from(
    document.querySelectorAll(
      '[data-testid="task-form-labels-popover"] [data-testid^="task-form-labels-option-"]',
    ),
  );
  expect(options.map((o) => o.textContent)).toEqual(["bug", "feature"]);
});

test("getLabels が失敗しても popover は開き、新規作成のみ可能になる（結合）", async () => {
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
  openLabels();
  // 候補（既存ラベル option）は無いが popover 自体は開き、検索 + 新規作成は使える。
  expect(
    document.querySelector('[data-testid="task-form-labels-popover"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid^="task-form-labels-option-"]'),
  ).toBeNull();
  typeLabelSearch("brand-new");
  expect(
    document.querySelector('[data-testid="task-form-labels-create"]'),
  ).toBeTruthy();
});

test("popover の option クリックでラベルが選択され trigger に表示される（結合）", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({ labels: [{ name: "bug" }], usageCounts: {} }),
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
  openLabels();
  const option = document.querySelector(
    '[data-testid="task-form-labels-option-bug"]',
  ) as HTMLButtonElement;
  expect(option.getAttribute("aria-pressed")).toBe("false");
  act(() => {
    option.click();
  });
  expect(
    document
      .querySelector('[data-testid="task-form-labels-option-bug"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  const trigger = document.querySelector(
    '[data-testid="task-form-labels"]',
  ) as HTMLButtonElement;
  expect(trigger.textContent).toContain("bug");
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

test("IPC 成功で保存先パスプレビューが表示される", async () => {
  previewMock.mockResolvedValue(
    Result.ok({
      kind: "path",
      fileName: "my-task.md",
      relPath: "tasks/my-task.md",
      fullPath: "/tmp/project/tasks/my-task.md",
    }),
  );
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  await act(async () => {
    changeInputValue(title, "My Task");
  });
  await act(async () => {
    await Promise.resolve();
  });
  const preview = document.querySelector(
    '[data-testid="task-form-path-preview"]',
  );
  expect(preview?.textContent).toBe("/tmp/project/tasks/my-task.md");
});

test("IPC が invalid を返すとプレビューが警告表示に切り替わる", async () => {
  previewMock.mockResolvedValue(
    Result.ok({
      kind: "invalid",
      error: "title cannot be converted to filename",
    }),
  );
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  });
  const title = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
  await act(async () => {
    changeInputValue(title, "!!!");
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(
    document.querySelector('[data-testid="task-form-path-warning"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="task-form-path-preview"]'),
  ).toBeNull();
});

test("fileName のみの入力では onValuesChange が追加発火しない（既存最適化のリグレッション防止）", () => {
  const onValuesChange = vi.fn();
  render({
    columns: COLUMNS,
    initialStatus: "Todo",
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onValuesChange,
  });
  const callsAfterMount = onValuesChange.mock.calls.length;
  const fileName = document.querySelector(
    '[data-testid="task-form-file-name"]',
  ) as HTMLInputElement;
  act(() => {
    changeInputValue(fileName, "custom");
  });
  expect(onValuesChange.mock.calls.length).toBe(callsAfterMount);
});
