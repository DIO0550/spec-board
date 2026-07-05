import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskCreateScreen } from "@/features/task-form/components/TaskCreateScreen";
import type { CreateTaskSubmitOutcome } from "@/features/task-form/hooks/useTaskCreate";
import { TauriError, unregisterToastSink } from "@/lib/tauri";
import { ProjectError } from "@/providers/ProjectProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import type { Column } from "@/types/column";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  unregisterToastSink();
});

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

const STUB_PARENT = Task.fromPayload({
  id: "p-stub",
  title: "親",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/stub-parent.md",
});

const SUCCESS_OUTCOME: CreateTaskSubmitOutcome = {
  parent: STUB_PARENT,
  failedSubIssues: [],
};

const baseProps = (
  overrides: Partial<Parameters<typeof TaskCreateScreen>[0]> = {},
): Parameters<typeof TaskCreateScreen>[0] => ({
  columns: COLUMNS,
  initialStatus: "Todo",
  existingTasks: [],
  watchedFileCount: 0,
  onSubmit: vi.fn().mockResolvedValue(Result.ok(SUCCESS_OUTCOME)),
  onClose: vi.fn(),
  ...overrides,
});

/**
 * TaskCreateScreen を ToastProvider 配下にマウントするヘルパー。
 * @param props - TaskCreateScreen に渡す props
 */
const render = (props: Parameters<typeof TaskCreateScreen>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        ToastProvider,
        null,
        createElement(TaskCreateScreen, props),
      ),
    );
  });
};

const setTitle = (value: string) => {
  const el = document.querySelector(
    '[data-testid="task-form-title"]',
  ) as HTMLInputElement;
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

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

test("送信成功で success toast が出て onClose が 1 回呼ばれる", async () => {
  const onSubmit = vi.fn().mockResolvedValue(Result.ok(SUCCESS_OUTCOME));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(
    document.querySelectorAll('[data-testid="toast-success"]').length,
  ).toBe(1);
  expect(
    document.querySelector('[data-testid="toast-success"]')?.textContent,
  ).toContain("タスクを作成しました");
  expect(onClose).toHaveBeenCalledOnce();
});

test("failedSubIssues が 1 件で warning toast が出て success toast は出ない", async () => {
  const onSubmit = vi.fn().mockResolvedValue(
    Result.ok<CreateTaskSubmitOutcome>({
      parent: STUB_PARENT,
      failedSubIssues: [
        { title: "child", error: ProjectError.invalidState("nope") },
      ],
    }),
  );
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(
    document.querySelectorAll('[data-testid="toast-warning"]').length,
  ).toBe(1);
  expect(
    document.querySelector('[data-testid="toast-warning"]')?.textContent,
  ).toContain("サブIssue 1 件の作成に失敗しました");
  expect(
    document.querySelectorAll('[data-testid="toast-success"]').length,
  ).toBe(0);
  expect(onClose).toHaveBeenCalledOnce();
});

test("failedSubIssues が 3 件のとき文言に件数が含まれる", async () => {
  const onSubmit = vi.fn().mockResolvedValue(
    Result.ok<CreateTaskSubmitOutcome>({
      parent: STUB_PARENT,
      failedSubIssues: [
        { title: "c1", error: ProjectError.invalidState("e1") },
        { title: "c2", error: ProjectError.invalidState("e2") },
        { title: "c3", error: ProjectError.invalidState("e3") },
      ],
    }),
  );
  render(baseProps({ onSubmit }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(
    document.querySelector('[data-testid="toast-warning"]')?.textContent,
  ).toContain("サブIssue 3 件の作成に失敗しました");
});

test("wasNotifiedByInvokeWrapped が true の error は toast を出さず onClose も呼ばない", async () => {
  // create_task は allowlist 対象なので invokeWrapped 層が toast 通知済みとみなす。
  const tauriErr = new TauriError(
    "UNKNOWN",
    "create failed",
    undefined,
    "create_task",
  );
  const onSubmit = vi
    .fn()
    .mockResolvedValue(Result.err(ProjectError.tauri(tauriErr)));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  expect(document.querySelectorAll('[data-testid="toast-error"]').length).toBe(
    0,
  );
  expect(onClose).not.toHaveBeenCalled();
});

test("wasNotifiedByInvokeWrapped が false の error は error toast を出して onClose は呼ばない", async () => {
  const onSubmit = vi
    .fn()
    .mockResolvedValue(Result.err(ProjectError.invalidState("bad state")));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  const errorToast = document.querySelector('[data-testid="toast-error"]');
  expect(errorToast).toBeTruthy();
  expect(errorToast?.textContent ?? "").toMatch(/^タスクの作成に失敗しました:/);
  expect(onClose).not.toHaveBeenCalled();
});

test("onSubmit が契約違反で reject しても画面はクラッシュせず error toast が出て onClose は呼ばれない", async () => {
  // useTaskCreate / App.handleCreateTask は Result を返す契約だが、契約違反で reject されても
  // 画面ごとクラッシュさせない安全弁（catch）を検証する。
  const onSubmit = vi.fn().mockRejectedValue(new Error("contract violation"));
  const onClose = vi.fn();
  render(baseProps({ onSubmit, onClose }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  await flush();
  const errorToast = document.querySelector('[data-testid="toast-error"]');
  expect(errorToast).toBeTruthy();
  expect(errorToast?.textContent ?? "").toContain("想定外のエラー");
  expect(onClose).not.toHaveBeenCalled();
});

test("送信中の二重 submit でも success toast は 1 件だけ", async () => {
  let resolveSubmit:
    | ((v: Result<CreateTaskSubmitOutcome, ProjectError>) => void)
    | undefined;
  const onSubmit = vi.fn(
    () =>
      new Promise<Result<CreateTaskSubmitOutcome, ProjectError>>((resolve) => {
        resolveSubmit = resolve;
      }),
  );
  render(baseProps({ onSubmit }));
  act(() => {
    setTitle("新タスク");
  });
  act(() => {
    submitForm();
  });
  act(() => {
    submitForm();
  });
  expect(onSubmit).toHaveBeenCalledOnce();
  await act(async () => {
    resolveSubmit?.(Result.ok(SUCCESS_OUTCOME));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(
    document.querySelectorAll('[data-testid="toast-success"]').length,
  ).toBe(1);
});
