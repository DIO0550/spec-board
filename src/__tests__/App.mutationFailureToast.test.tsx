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
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/mime";
import { unregisterToastSink } from "@/lib/tauri";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import type { TaskPayload } from "@/types/task";

// (b) 実発火版 / (c) 撤去回帰版 / 非サイレント系の統合テスト。
// root barrel `@/lib/tauri` は丸ごとモックせず、`@tauri-apps/api/core` の invoke だけを
// 制御することで invokeWrapped → sink → ToastContainer の実発火経路を通す。
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

const seedFilePath = "tasks/a.md";

const seedTaskPayload: TaskPayload = {
  id: "a",
  title: "A タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "元の本文",
  filePath: seedFilePath,
  extras: {},
  warnings: [],
};

const seedTaskPayloadB: TaskPayload = {
  id: "b",
  title: "B タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "本文B",
  filePath: "tasks/b.md",
  extras: {},
  warnings: [],
};

const openProjectRawPayload = {
  tasks: [seedTaskPayload],
  columns: ["Todo", "Doing", "Done"],
};

// 同一カラム並び替えを発火させるため Todo に 2 件並べた payload。
const twoTaskRawPayload = {
  tasks: [seedTaskPayload, seedTaskPayloadB],
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

// モジュールスコープ sink がテスト間でリークしないよう必ず解除する。
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  unregisterToastSink();
});

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

const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

/**
 * TaskCard を指定カラム section へ drop する。
 * 別カラムなら status 変更（update_task）、同一カラムなら並び替え（update_card_order）が走る。
 * @param columnLabel drop 先カラム名（section の aria-label）
 */
const dropFirstCardTo = async (columnLabel: string): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const section = container?.querySelector<HTMLElement>(
    `section[aria-label='${columnLabel}']`,
  );
  await act(async () => {
    card?.dispatchEvent(createDragEvent("dragstart"));
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, seedFilePath);
  await act(async () => {
    section?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * 先頭カラムのヘッダを末尾カラム section へ drop する（カラム並び替え → update_columns）。
 * @param toColumnLabel drop 先カラム名（section の aria-label）
 */
const dropFirstColumnTo = async (toColumnLabel: string): Promise<void> => {
  const headers = container?.querySelectorAll<HTMLElement>(
    "[data-testid='column-header']",
  );
  const headerFirst = headers?.[0];
  const section = container?.querySelector<HTMLElement>(
    `section[aria-label='${toColumnLabel}']`,
  );
  const startEvent = createDragEvent("dragstart");
  await act(async () => {
    headerFirst?.dispatchEvent(startEvent);
  });
  const drop = createDragEvent("drop", {
    dataTransfer: startEvent.dataTransfer,
  });
  await act(async () => {
    section?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * MarkdownBody の display をクリックして textarea を開き、値を流して Cmd+Enter で確定する。
 * これにより handleTaskUpdate → updateTask（update_task）が走る。
 * @param value 確定後の body 値
 */
const editBodyViaUI = async (value: string): Promise<void> => {
  const display = container?.querySelector<HTMLElement>(
    '[data-testid="markdown-body"]',
  );
  await act(async () => {
    display?.click();
  });
  const textarea = container?.querySelector<HTMLTextAreaElement>(
    '[data-testid="markdown-body-textarea"]',
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    textarea?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
};

const errorToasts = (): Element[] =>
  Array.from(container?.querySelectorAll('[data-testid="toast-error"]') ?? []);

const successToast = (): Element | null =>
  container?.querySelector('[data-testid="toast-success"]') ?? null;

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
      // App が loaded 時に useMilestones から呼ぶ読み取り系。空レジストリを返す。
      get_milestones: () =>
        Promise.resolve({ milestones: [], usageCounts: {} }),
      // 同じく useLabels から呼ぶ読み取り系。空レジストリ + 空 usageCounts。
      get_labels: () => Promise.resolve({ labels: [], usageCounts: {} }),
      ...overrides,
    };
    return (responders[cmd] ?? resolveUndefined)();
  };

test("(b)(c) update_task 失敗で error トーストが 1 件だけ実発火する（実経路 + 二重なし）", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      update_task: () => Promise.reject(new Error("書き込みに失敗しました")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  openDetailScreen();
  await editBodyViaUI("新しい本文");

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  expect(errorToasts()[0].textContent).toContain(
    "タスクの更新に失敗しました: 書き込みに失敗しました",
  );
});

test("update_task 成功時は success トーストが出て error トーストは出ない", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      update_task: () =>
        Promise.resolve({ ...seedTaskPayload, body: "新しい本文" }),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  openDetailScreen();
  await editBodyViaUI("新しい本文");

  await vi.waitFor(() => {
    expect(successToast()).not.toBeNull();
  });
  expect(successToast()?.textContent).toContain("タスクを更新しました");
  expect(errorToasts().length).toBe(0);
});

test("非サイレント: open_project 失敗（allowlist 外 tauri）は onError 経由で App が通知する", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      open_project: () =>
        Promise.reject(new Error("ディレクトリにアクセスできません")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  // invokeWrapped は allowlist 外なので発火しない → App の onError が 1 件だけ出す。
  expect(errorToasts()[0].textContent).toContain(
    "ディレクトリにアクセスできません",
  );
});

test("cross-column 移動の update_task 失敗は invokeWrapped 通知のみ（計 1 件・重複なし）", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      update_task: () => Promise.reject(new Error("書き込みに失敗しました")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  // Todo → Done のカラム間移動。status 更新は update_task（allowlist）。
  await dropFirstCardTo("Done");

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  // invokeWrapped が「タスクの更新に失敗しました」を出し、App generic「移動に失敗」は抑止。
  expect(errorToasts()[0].textContent).toContain("タスクの更新に失敗しました");
});

test("非サイレント: 同一カラム並び替えの update_card_order 失敗は generic を 1 件出す", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      open_project: () => Promise.resolve(twoTaskRawPayload),
      update_card_order: () => Promise.reject(new Error("並び順保存に失敗")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  // Todo に 2 件並んだ状態で先頭カードを末尾へ並び替え。update_card_order（allowlist 外）失敗。
  await dropFirstCardTo("Todo");

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  // invokeWrapped は発火しない → App の generic「タスクの移動に失敗しました」が残る。
  expect(errorToasts()[0].textContent).toContain("タスクの移動に失敗しました");
});

test("partial-move（status 成功・並び順保存失敗）は専用文のみ・generic も重複も出さない", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      // status 更新は成功し、その後の並び順保存（update_card_order）だけ失敗する。
      update_task: () =>
        Promise.resolve({ ...seedTaskPayload, status: "Done" }),
      update_card_order: () => Promise.reject(new Error("並び順保存に失敗")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  await dropFirstCardTo("Done");

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  // partial-move 専用文が出る。汎用「タスクの移動に失敗しました」や invokeWrapped 重複は出ない。
  expect(errorToasts()[0].textContent).toContain("並び順の保存に失敗しました");
  expect(errorToasts()[0].textContent).not.toContain(
    "タスクの移動に失敗しました",
  );
});

test("カラム並び替えの update_columns 失敗は invokeWrapped 通知のみ（計 1 件・重複なし）", async () => {
  openDialogMock.mockResolvedValueOnce("/p");
  invokeMock.mockImplementation(
    makeInvoke({
      update_columns: () => Promise.reject(new Error("書き込みに失敗しました")),
    }),
  );

  mountApp();
  await clickHeaderOpenButton();
  // 先頭カラム（Todo）を Done へ並び替え。reorderColumnsAction → updateColumns（update_columns）。
  await dropFirstColumnTo("Done");

  await vi.waitFor(() => {
    expect(errorToasts().length).toBe(1);
  });
  // invokeWrapped が「カラムの更新に失敗しました」を出し、App generic「並び替えに失敗」は抑止。
  expect(errorToasts()[0].textContent).toContain("カラムの更新に失敗しました");
});
