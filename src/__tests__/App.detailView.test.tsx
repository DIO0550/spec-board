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
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  getLabels as getLabelsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  updateTask as updateTaskInvoke,
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
    getLabels: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    updateColumns: vi.fn(),
    moveTask: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const getLabelsMock = vi.mocked(getLabelsInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);

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

beforeEach(() => {
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  getColumnsMock.mockResolvedValue({
    ok: true,
    value: {
      columns: [
        { name: "Todo", order: 0 },
        { name: "Doing", order: 1 },
        { name: "Done", order: 2 },
      ],
      doneColumn: "Done",
    },
  });
  getLabelsMock.mockReset();
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const taskA: Task = Task.fromPayload({
  id: "a",
  title: "A タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "本文",
  filePath: "tasks/a.md",
});

const payload: OpenProjectPayload = {
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA],
  columns: ["Todo", "Doing", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
};

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

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * 「開く」ボタンを押下して project を読み込ませる。
 */
const openSuccessfully = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await flush();
};

/**
 * TaskCard を click して detail（全画面2ペイン DetailScreen）へ遷移させる。
 */
const openDetail = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

/**
 * data-testid 要素を click する。
 * @param testId data-testid
 */
const clickTestId = (testId: string): void => {
  act(() => {
    (
      document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    ).click();
  });
};

/**
 * ヘッダーの「設定」ボタンを押す。
 */
const clickSettings = (): void => {
  const btn = Array.from(
    container?.querySelectorAll("header button") ?? [],
  ).find((b) => b.textContent === "設定") as HTMLButtonElement | undefined;
  act(() => {
    btn?.click();
  });
};

/**
 * ヘッダーの「ボードへ戻る」ボタンを押す。
 */
const clickBackToBoardHeader = (): void => {
  const btn = Array.from(
    container?.querySelectorAll("header button") ?? [],
  ).find((b) => b.textContent === "ボードへ戻る") as
    | HTMLButtonElement
    | undefined;
  act(() => {
    btn?.click();
  });
};

test("カード click で detail（DetailScreen）へ即遷移し、スライドパネルは出ない", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  // 一本化により DetailScreen（全画面2ペイン）の戻るボタンが現れる。
  // スライドパネルは廃止済みのため、board の overlay 要素は存在しない。
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
});

test("カードにフォーカスして Enter で detail へ遷移する", async () => {
  mountApp();
  await openSuccessfully();
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.focus();
    card?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
});

test("detail で「← 戻る」→ board（選択クリア・DetailScreen 非表示）", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  clickTestId("detail-back-button");
  await flush();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
  expect(container?.textContent).toContain("A タスク");
});

test("detail で Esc → board（選択クリア）", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  await flush();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
});

test("detail → board でボード state（カラム/タスク）が保持される", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  clickTestId("detail-back-button");
  await flush();
  expect(container?.textContent).toContain("A タスク");
  expect(container?.textContent).toContain("Todo");
});

test("detail 表示中に「設定」→ settings 直行（detail 完全クローズ・選択解除）", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  clickSettings();
  await flush();
  expect(container?.querySelector('[role="tablist"]')).not.toBeNull();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
});

test("detail →（設定）→ settings →（ボードへ戻る）→ board で detail が再表示されない", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  clickSettings();
  await flush();
  clickBackToBoardHeader();
  await flush();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
  expect(container?.textContent).toContain("A タスク");
});

test("detail のサイドバーから update_task（楽観反映）が呼ばれる", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  updateTaskMock.mockResolvedValueOnce(
    Result.ok({ ...taskA, status: "Doing" }),
  );
  await act(async () => {
    (
      document.querySelector('[data-testid="status-field"]') as HTMLElement
    ).click();
  });
  await act(async () => {
    (
      document.querySelector(
        '[data-testid="status-field-option-Doing"]',
      ) as HTMLElement
    ).click();
    await Promise.resolve();
  });
  // IPC resolve 前に楽観反映で trigger 表示が Doing になる
  expect(
    document.querySelector('[data-testid="status-field"]')?.textContent,
  ).toContain("Doing");
  expect(updateTaskMock).toHaveBeenCalled();
});

test("detail 表示中にプロジェクト切替で選択タスク消失→board へフォールバックする", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();

  // 別プロジェクト（別 path・選択タスクを含まない）へ切り替える
  const otherTask = Task.fromPayload({
    id: "z",
    title: "Z タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/z.md",
  });
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/other"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      session: WATCHER_SESSION_FIXTURE,
      tasks: [otherTask],
      columns: ["Todo", "Doing", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
    }),
  );
  const openBtn = Array.from(
    container?.querySelectorAll("header button") ?? [],
  ).find((b) => b.textContent === "開く") as HTMLButtonElement | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await flush();

  // detail に取り残されず board へフォールバック（全画面ビュー非表示）
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
  expect(container?.textContent).toContain("Z タスク");
});

test("detail のサブIssue追加 → 作成画面で Esc は board ではなく元の detail へ戻す", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  // detail のサブIssue追加から全画面の作成画面（create ビュー）へ遷移する。
  const addBtn = document.querySelector(
    '[data-testid="sub-issue-add-button"]',
  ) as HTMLButtonElement | null;
  await act(async () => {
    addBtn?.click();
  });
  // 全画面 create ビューに切り替わり detail は unmount される。
  expect(
    document.querySelector('[data-testid="task-create-screen"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeNull();
  // Esc で作成画面を閉じると、戻り先は board ではなく元の detail（returnView="detail"）。
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  await flush();
  expect(
    document.querySelector('[data-testid="task-create-screen"]'),
  ).toBeNull();
  expect(
    document.querySelector('[data-testid="detail-back-button"]'),
  ).toBeTruthy();
});

test("detail のサイドバーから delete_task が呼ばれる", async () => {
  mountApp();
  await openSuccessfully();
  openDetail();
  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));
  clickTestId("detail-delete-button");
  await act(async () => {
    clickTestId("confirm-confirm-button");
    await Promise.resolve();
  });
  expect(deleteTaskMock).toHaveBeenCalled();
});
