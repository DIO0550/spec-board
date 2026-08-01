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
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  removeLink as removeLinkInvoke,
  TauriError,
} from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openDirectoryDialog: vi.fn(),
    openProject: vi.fn(),
    getColumns: vi.fn(),
    removeLink: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const removeLinkMock = vi.mocked(removeLinkInvoke);

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

/**
 * link を持つ A の Task fixture を生成する。
 * @returns Task
 */
const makeTaskAWithLink = (): Task =>
  Task.fromPayload({
    id: "a",
    title: "A",
    status: "Todo",
    labels: [],
    links: ["tasks/b.md"],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
  });

/**
 * A から reverseLink される B の Task fixture を生成する。
 * @returns Task
 */
const makeTaskBReversed = (): Task =>
  Task.fromPayload({
    id: "b",
    title: "B",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: ["tasks/a.md"],
    body: "",
    filePath: "tasks/b.md",
  });

/**
 * OpenProjectPayload を生成する。
 * @param tasks 含める task 配列
 * @returns OpenProjectPayload
 */
const makePayload = (tasks: Task[]): OpenProjectPayload => ({
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks,
  columns: ["Todo", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
});

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: {
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    },
  });
  removeLinkMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

/**
 * App を mount する。
 */
const mountApp = (): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

/**
 * ヘッダーの「開く」ボタンをクリックする。
 */
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
    await Promise.resolve();
  });
};

/**
 * project を mock データで open する。
 * @param tasks payload に含める task 配列
 */
const openProjectWith = async (tasks: Task[]): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(makePayload(tasks)));
  await clickHeaderOpenButton();
};

/**
 * title で task card を探してクリックする。
 * @param title 開きたいタスクのタイトル
 */
const clickTaskCard = (title: string): void => {
  const cards = container?.querySelectorAll<HTMLElement>(
    "[data-testid='task-card']",
  );
  const card = Array.from(cards ?? []).find((c) => {
    const titleEl = c.querySelector<HTMLElement>(
      "[data-testid='task-card-title']",
    );
    return titleEl?.textContent === title;
  });
  act(() => {
    card?.click();
  });
};

/**
 * × ボタンを click し、Promise チェーンを流す。
 * @param selector testid を含めた querySelector 文字列
 */
const clickRemoveButton = async (selector: string): Promise<void> => {
  const btn = document.querySelector(selector) as HTMLButtonElement | null;
  await act(async () => {
    btn?.click();
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
};

/**
 * aria-live region のテキストを取り出す。
 * @returns aria-live region の textContent
 */
const queryLiveRegionText = (): string =>
  document.querySelector('[data-testid="live-region"]')?.textContent ?? "";

test("forward 削除: linked × クリックで該当 li が消え、IPC に source=自分/target=相手 で渡る", async () => {
  const taskA = makeTaskAWithLink();
  const taskB = makeTaskBReversed();
  removeLinkMock.mockResolvedValue(
    Result.ok(
      Task.fromPayload({
        id: "a",
        title: "A",
        status: "Todo",
        labels: [],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/a.md",
        extras: {},
        warnings: [],
      }),
    ),
  );

  mountApp();
  await openProjectWith([taskA, taskB]);

  clickTaskCard("A");
  // 初期状態で linked 行が存在
  expect(
    document.querySelector(
      '[data-path="tasks/b.md"][data-testid^="links-section-linked-"]',
    ),
  ).toBeTruthy();

  await clickRemoveButton(
    'button[data-path="tasks/b.md"][data-testid^="links-section-linked-remove-"]',
  );

  // 該当 li が消えている
  expect(
    document.querySelector(
      '[data-path="tasks/b.md"][data-testid^="links-section-linked-"]',
    ),
  ).toBeNull();
  // IPC は { sourceFilePath: 自分, targetFilePath: 相手 }
  expect(removeLinkMock).toHaveBeenCalledWith({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });
  // 成功 announce
  expect(queryLiveRegionText()).toContain(
    "「A」から「B」へのリンクを削除しました",
  );
});

test("reverse 行には × 削除ボタンが存在しない（reverseLinks は読み取り専用）", async () => {
  const taskA = makeTaskAWithLink();
  const taskB = makeTaskBReversed();

  mountApp();
  await openProjectWith([taskA, taskB]);

  clickTaskCard("B");
  const reverseRow = document.querySelector(
    'li[data-path="tasks/a.md"][data-testid^="links-section-reverse-"]',
  );
  expect(reverseRow).toBeTruthy();
  // reverse 行には × 削除ボタンが存在しない
  expect(
    reverseRow?.querySelector('button[aria-label="リンクを削除"]'),
  ).toBeNull();
});

test("IPC 失敗時は該当 li が復活し、取り消し announce が出る", async () => {
  const taskA = makeTaskAWithLink();
  const taskB = makeTaskBReversed();
  removeLinkMock.mockResolvedValue(
    Result.err(TauriError.from(new Error("io"))),
  );

  mountApp();
  await openProjectWith([taskA, taskB]);

  clickTaskCard("A");
  await clickRemoveButton(
    'button[data-path="tasks/b.md"][data-testid^="links-section-linked-remove-"]',
  );

  // 該当 li が復活
  expect(
    document.querySelector(
      '[data-path="tasks/b.md"][data-testid^="links-section-linked-"]',
    ),
  ).toBeTruthy();
  // 取り消し announce
  expect(queryLiveRegionText()).toContain(
    "「A」から「B」へのリンク削除を取り消しました",
  );
});
