import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { App } from "@/App";
import { unregisterToastSink } from "@/lib/tauri";
import type { TaskPayload } from "@/types/task";

// サブIssue 同時作成の部分失敗分岐（handleCreateTask）の App レベル統合テスト。
// `@tauri-apps/api/core` の invoke だけを制御し、実経路（useTaskCreate の直列ループ →
// トースト表示 → 画面クローズ）を通す（App.mutationFailureToast.test.tsx が雛形）。
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const invokeMock = vi.mocked(invoke);
const openDialogMock = vi.mocked(openDialog);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const parentPayload: TaskPayload = {
  id: "parent",
  title: "親タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/parent-task.md",
  extras: {},
  warnings: [],
};

const childPayload = (n: number): TaskPayload => ({
  id: `child-${n}`,
  title: `子${n}`,
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: `tasks/child-${n}.md`,
  extras: {},
  warnings: [],
});

const openProjectRawPayload = {
  tasks: [],
  columns: ["Todo", "Doing", "Done"],
};

const getColumnsRawPayload = {
  columns: [
    { name: "Todo", order: 0 },
    { name: "Doing", order: 1 },
    { name: "Done", order: 2 },
  ],
  doneColumn: "Done",
};

beforeEach(() => {
  invokeMock.mockReset();
  openDialogMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  unregisterToastSink();
});

type Responder = () => Promise<unknown>;

const resolveUndefined: Responder = () => Promise.resolve(undefined);

// open_project / get_columns を成功させる基底応答に overrides を重ねた invoke 実装を作る。
// 分岐を使わず cmd → responder の写像で routing する（テストの条件分岐禁止ルール準拠）。
const makeInvoke =
  (overrides: Record<string, Responder>) =>
  (cmd: string): Promise<unknown> => {
    const responders: Record<string, Responder> = {
      open_project: () => Promise.resolve(openProjectRawPayload),
      get_columns: () => Promise.resolve(getColumnsRawPayload),
      get_milestones: () =>
        Promise.resolve({ milestones: [], usageCounts: {} }),
      get_labels: () => Promise.resolve({ labels: [] }),
      preview_task_filename: () => Promise.resolve({ kind: "pending" }),
      ...overrides,
    };
    return (responders[cmd] ?? resolveUndefined)();
  };

/**
 * create_task の応答を呼び出し回数順に消化する responder を作る。
 * テスト内の条件分岐を避けるため配列 index で routing する。
 * @param responses 呼び出し順の応答一覧
 * @returns invoke override 用 responder
 */
const sequencedResponder = (responses: Responder[]): Responder => {
  let callCount = 0;
  return () => {
    const responder = responses[callCount] ?? resolveUndefined;
    callCount += 1;
    return responder();
  };
};

const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

const clickHeaderOpenButton = async (): Promise<void> => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const openCreateScreen = async (): Promise<void> => {
  const addBtn = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Todoに追加"]',
  );
  await act(async () => {
    addBtn?.click();
  });
};

const setInput = (testId: string, value: string): void => {
  const el = document.querySelector(`[data-testid="${testId}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitCreateForm = async (): Promise<void> => {
  const form = document.querySelector(
    '[data-testid="task-form"]',
  ) as HTMLFormElement;
  await act(async () => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const fillAndSubmit = async (): Promise<void> => {
  act(() => {
    setInput("task-form-title", "親タスク");
  });
  act(() => {
    setInput("task-form-sub-issues", "子1\n子2");
  });
  await submitCreateForm();
};

const toastOf = (kind: string): Element | null =>
  container?.querySelector(`[data-testid="toast-${kind}"]`) ?? null;

test("全件成功: success トーストが出て作成画面が閉じる", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      create_task: sequencedResponder([
        () => Promise.resolve(parentPayload),
        () => Promise.resolve(childPayload(1)),
        () => Promise.resolve(childPayload(2)),
      ]),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  await openCreateScreen();
  await fillAndSubmit();

  await vi.waitFor(() => {
    expect(toastOf("success")?.textContent).toContain("タスクを作成しました");
  });
  expect(toastOf("warning")).toBeNull();
  expect(document.querySelector('[data-testid="task-form"]')).toBeNull();
});

test("子の部分失敗: warning トーストが出て画面は閉じる（親は残す）", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      create_task: sequencedResponder([
        () => Promise.resolve(parentPayload),
        () => Promise.reject(new Error("書き込みに失敗しました")),
        () => Promise.resolve(childPayload(2)),
      ]),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  await openCreateScreen();
  await fillAndSubmit();

  await vi.waitFor(() => {
    expect(toastOf("warning")?.textContent).toContain(
      "サブIssue 1 件の作成に失敗しました",
    );
  });
  expect(toastOf("success")).toBeNull();
  expect(document.querySelector('[data-testid="task-form"]')).toBeNull();
});

test("親失敗: エラートーストが出て作成画面は閉じない（子は作成されない）", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  const createTaskMock = vi.fn(() =>
    Promise.reject(new Error("書き込みに失敗しました")),
  );
  invokeMock.mockImplementation(
    makeInvoke({
      create_task: createTaskMock,
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  await openCreateScreen();
  await fillAndSubmit();

  await vi.waitFor(() => {
    expect(toastOf("error")?.textContent).toContain(
      "タスクの作成に失敗しました",
    );
  });
  expect(createTaskMock).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-testid="task-form"]')).not.toBeNull();
});
