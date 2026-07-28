import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { App } from "@/App";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/mime";
import {
  getColumns as getColumnsInvoke,
  moveTask as moveTaskInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  updateColumns as updateColumnsInvoke,
} from "@/lib/tauri";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
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
const moveTaskMock = vi.mocked(moveTaskInvoke);
const updateColumnsMock = vi.mocked(updateColumnsInvoke);

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
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    },
  });
  moveTaskMock.mockReset();
  updateColumnsMock.mockReset();
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
  body: "",
  filePath: "tasks/a.md",
});

const taskB: Task = Task.fromPayload({
  id: "b",
  title: "B タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/b.md",
});

const payload: OpenProjectPayload = {
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA, taskB],
  columns: ["Todo", "Done"],
  projections: new Map(),
};

/**
 * テスト用の App マウントヘルパ。
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
 * HeaderBar の「開く」ボタンを押下する。
 */
const clickHeaderOpenButton = (): void => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  openBtn?.click();
};

/**
 * project を成功状態で読み込む。
 */
const openSuccessfully = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * TaskCard を Done カラム section へ drop する。
 */
const dropFirstCardToDone = async (): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  await act(async () => {
    card?.dispatchEvent(createDragEvent("dragstart"));
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  await act(async () => {
    doneSection?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

/**
 * TaskCard を Todo カラム section へ drop（同一カラム並び替え相当）。
 */
const dropFirstCardWithinTodo = async (): Promise<void> => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const todoSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Todo']",
  );
  await act(async () => {
    card?.dispatchEvent(createDragEvent("dragstart"));
  });
  const drop = createDragEvent("drop");
  drop.dataTransfer.setData(DRAG_MIME_TYPE, "tasks/a.md");
  await act(async () => {
    todoSection?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const liveRegion = (): HTMLElement | null =>
  container?.querySelector<HTMLElement>('[data-testid="live-region"]') ?? null;

/**
 * LiveRegion の visible text を取得する。
 * SR トリガ用に末尾へ付加される可能性のあるゼロ幅スペースを除去して比較する。
 *
 * @returns ゼロ幅スペースを除いた textContent
 */
const liveRegionText = (): string =>
  (liveRegion()?.textContent ?? "").replace(/​/g, "");

test("drop 成功 → LiveRegion に「移動しました」が現れる", async () => {
  mountApp();
  await openSuccessfully();

  const movedA: Task = { ...taskA, status: "Done" };
  moveTaskMock.mockResolvedValueOnce(Result.ok(movedA));

  await dropFirstCardToDone();

  expect(liveRegionText()).toBe("「A タスク」を「Done」に移動しました");
});

test("drop 楽観 announce は move_task resolve 前に LiveRegion へ届いている", async () => {
  mountApp();
  await openSuccessfully();

  type MoveTaskResult = Awaited<ReturnType<typeof moveTaskMock>>;
  let resolveMove: (value: MoveTaskResult) => void = () => {};
  moveTaskMock.mockReturnValueOnce(
    new Promise<MoveTaskResult>((resolve) => {
      resolveMove = resolve;
    }),
  );

  await dropFirstCardToDone();
  expect(liveRegionText()).toBe("「A タスク」を「Done」に移動しました");

  await act(async () => {
    resolveMove(Result.ok({ ...taskA, status: "Done" }));
    await Promise.resolve();
  });
});

test("drop 失敗 (move_task reject) → LiveRegion が「取り消しました」になる", async () => {
  mountApp();
  await openSuccessfully();

  moveTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  await dropFirstCardToDone();

  expect(liveRegionText()).toBe("「A タスク」の移動を取り消しました");
});

test("同一カラム並び替え → LiveRegion textContent は空のまま", async () => {
  mountApp();
  await openSuccessfully();

  moveTaskMock.mockResolvedValueOnce(Result.ok(taskA));

  await dropFirstCardWithinTodo();

  expect(liveRegion()?.textContent).toBe("");
});

test("drop 後の LiveRegion は同一の安定 DOM ノードを維持しつつ visible text が更新される", async () => {
  mountApp();
  await openSuccessfully();

  const before = liveRegion();
  const movedA: Task = { ...taskA, status: "Done" };
  moveTaskMock.mockResolvedValue(Result.ok(movedA));

  await dropFirstCardToDone();
  const after = liveRegion();
  expect(after).toBe(before);
  expect(liveRegionText()).toBe("「A タスク」を「Done」に移動しました");
});

// === column reorder ===

const threeColumnPayload: OpenProjectPayload = {
  session: WATCHER_SESSION_FIXTURE,
  tasks: [],
  columns: ["A", "B", "C"],
  projections: new Map(),
};

const openThreeColumnProject = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p3"));
  openProjectMock.mockResolvedValueOnce(Result.ok(threeColumnPayload));
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [
        { name: "A", order: 0 },
        { name: "B", order: 1 },
        { name: "C", order: 2 },
      ],
      doneColumn: "C",
    }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const dropColumnAToC = async (): Promise<void> => {
  const headers = container?.querySelectorAll<HTMLElement>(
    "[data-testid='column-header']",
  );
  const headerA = headers?.[0];
  const sectionC = container?.querySelector<HTMLElement>(
    "section[aria-label='C']",
  );
  const startEvent = createDragEvent("dragstart");
  await act(async () => {
    headerA?.dispatchEvent(startEvent);
  });
  const drop = createDragEvent("drop", {
    dataTransfer: startEvent.dataTransfer,
  });
  await act(async () => {
    sectionC?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

test("column 並び替え成功 → LiveRegion に「N 番目に移動しました」", async () => {
  mountApp();
  await openThreeColumnProject();
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));

  await dropColumnAToC();

  expect(liveRegionText()).toBe("「A」を 3 番目に移動しました");
});

test("column 並び替え失敗 → LiveRegion に「取り消しました」", async () => {
  mountApp();
  await openThreeColumnProject();
  updateColumnsMock.mockResolvedValueOnce(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );

  await dropColumnAToC();

  expect(liveRegionText()).toBe("「A」の移動を取り消しました");
});

// === DetailScreen 内タスク遷移 announce ===

const openParentChildProject = async (): Promise<void> => {
  // テスト間で同一 Task インスタンスを共有しないよう、呼び出しごとに生成する。
  const parentTask: Task = Task.fromPayload({
    id: "p1",
    title: "親タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: ["tasks/c1.md"],
    reverseLinks: [],
    body: "",
    filePath: "tasks/p1.md",
  });
  const childTask: Task = Task.fromPayload({
    id: "c1",
    title: "子1",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/c1.md",
    parent: "tasks/p1.md",
  });
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/pc"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      session: WATCHER_SESSION_FIXTURE,
      tasks: [parentTask, childTask],
      columns: ["Todo", "Done"],
      // 直下子の解決は BE projection の childFilePaths 経由になった。
      projections: new Map([
        [
          "tasks/p1.md",
          {
            subIssueProgress: { done: 0, total: 1 },
            isDone: false,
            childFilePaths: ["tasks/c1.md"],
          },
        ],
      ]),
    }),
  );
  // beforeEach の暗黙初期化に依存させず、必要な columns / doneColumn を
  // helper 自身で明示することでテスト追加・並び替え時のフレークを防ぐ。
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const clickParentCard = async (): Promise<void> => {
  const cards = container?.querySelectorAll<HTMLElement>(
    "[data-testid='task-card']",
  );
  const parentCard = Array.from(cards ?? []).find(
    (c) =>
      c.querySelector('[data-testid="task-card-title"]')?.textContent ===
      "親タスク",
  );
  assert(parentCard !== undefined, "親タスクの task-card が見つからない");
  await act(async () => {
    parentCard.click();
  });
};

const clickChildSubIssue = async (): Promise<void> => {
  const childBtn = container?.querySelector<HTMLButtonElement>(
    '[data-testid="sub-issue-item-c1"]',
  );
  assert(childBtn != null, "sub-issue-item-c1 ボタンが見つからない");
  await act(async () => {
    childBtn.click();
  });
};

const clickParentLink = async (): Promise<void> => {
  const link = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  assert(link != null, "detail-parent-link が見つからない");
  await act(async () => {
    link.click();
  });
};

const detailTitleValue = (): string | null => {
  const input = container?.querySelector<HTMLInputElement>(
    '[aria-label="タスクタイトル"]',
  );
  return input?.value ?? null;
};

test("DetailScreen の子クリックで LiveRegion に「{title}を表示中」が流れ、DetailScreen が子に切り替わる", async () => {
  mountApp();
  await openParentChildProject();
  await clickParentCard();
  expect(detailTitleValue()).toBe("親タスク");

  await clickChildSubIssue();

  expect(liveRegionText()).toBe("「子1」を表示中");
  expect(detailTitleValue()).toBe("子1");
});

test("ParentLink クリックでも LiveRegion に「{title}を表示中」が流れ、親に戻る", async () => {
  mountApp();
  await openParentChildProject();
  await clickParentCard();
  await clickChildSubIssue();
  expect(detailTitleValue()).toBe("子1");

  await clickParentLink();

  expect(liveRegionText()).toBe("「親タスク」を表示中");
  expect(detailTitleValue()).toBe("親タスク");
});

// === DetailScreen 内 LinksSection 行クリック遷移 announce ===
//
// links 行 / reverse 行クリック → handleSelectTask → selectTaskOutcome → announce + in-place 切替の
// E2E パス。fixture は `Task.id === Task.filePath` の不変条件に従い `id` と `filePath` を同値で作る。

const openLinkedTasksProject = async (options?: {
  withBrokenLink?: boolean;
  withSelfLink?: boolean;
}): Promise<void> => {
  const linkedA: Task = Task.fromPayload({
    id: "tasks/la.md",
    title: "A",
    status: "Todo",
    labels: [],
    links: options?.withSelfLink
      ? ["tasks/lb.md", "tasks/la.md"]
      : options?.withBrokenLink
        ? ["tasks/lb.md", "tasks/missing.md"]
        : ["tasks/lb.md"],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/la.md",
  });
  const linkedB: Task = Task.fromPayload({
    id: "tasks/lb.md",
    title: "B",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: ["tasks/la.md"],
    body: "",
    filePath: "tasks/lb.md",
  });
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/pl"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      session: WATCHER_SESSION_FIXTURE,
      tasks: [linkedA, linkedB],
      columns: ["Todo", "Done"],
      projections: new Map(),
    }),
  );
  getColumnsMock.mockResolvedValueOnce(
    Result.ok({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const clickTaskCardByTitle = async (title: string): Promise<void> => {
  const cards = container?.querySelectorAll<HTMLElement>(
    "[data-testid='task-card']",
  );
  const card = Array.from(cards ?? []).find(
    (c) =>
      c.querySelector('[data-testid="task-card-title"]')?.textContent === title,
  );
  assert(card !== undefined, `${title} の task-card が見つからない`);
  await act(async () => {
    card.click();
  });
};

const clickLinkedNavigate = async (filePath: string): Promise<void> => {
  // 各 linked 行は raw path を testid に埋め込まず data-path 属性で保持するため、
  // path 由来の selector エスケープ問題を避けるためにここで lookup する。
  const btn = container?.querySelector<HTMLButtonElement>(
    `button[data-path="${filePath}"][data-testid^="links-section-linked-navigate-"]`,
  );
  assert(btn != null, `linked-navigate ${filePath} ボタンが見つからない`);
  await act(async () => {
    btn.click();
  });
};

const clickReverseNavigate = async (filePath: string): Promise<void> => {
  const btn = container?.querySelector<HTMLButtonElement>(
    `button[data-path="${filePath}"][data-testid^="links-section-reverse-navigate-"]`,
  );
  assert(btn != null, `reverse-navigate ${filePath} ボタンが見つからない`);
  await act(async () => {
    btn.click();
  });
};

test("DetailScreen の links 行クリックで LiveRegion に「{title}を表示中」が流れ、in-place 切替される", async () => {
  mountApp();
  await openLinkedTasksProject();
  await clickTaskCardByTitle("A");
  expect(detailTitleValue()).toBe("A");

  await clickLinkedNavigate("tasks/lb.md");

  expect(liveRegionText()).toBe("「B」を表示中");
  expect(detailTitleValue()).toBe("B");
});

test("DetailScreen の reverseLinks 行クリックでも in-place 切替される", async () => {
  mountApp();
  await openLinkedTasksProject();
  await clickTaskCardByTitle("B");
  expect(detailTitleValue()).toBe("B");

  await clickReverseNavigate("tasks/la.md");

  expect(liveRegionText()).toBe("「A」を表示中");
  expect(detailTitleValue()).toBe("A");
});

test("壊れたリンクは navigate ボタンが描画されず click 不可（broken 行のみ表示）", async () => {
  mountApp();
  await openLinkedTasksProject({ withBrokenLink: true });
  await clickTaskCardByTitle("A");

  const navigateBtn = container?.querySelector(
    'button[data-path="tasks/missing.md"][data-testid^="links-section-linked-navigate-"]',
  );
  expect(navigateBtn).toBeNull();
  const brokenRow = container?.querySelector(
    '[data-broken="true"][data-path="tasks/missing.md"]',
  );
  expect(brokenRow).not.toBeNull();
  // 画面は A のまま
  expect(detailTitleValue()).toBe("A");
});

test("自タスクを指す links 行クリックでは selectedTaskId 不変、LiveRegion は再アナウンスされる", async () => {
  mountApp();
  await openLinkedTasksProject({ withSelfLink: true });
  await clickTaskCardByTitle("A");
  expect(detailTitleValue()).toBe("A");

  await clickLinkedNavigate("tasks/la.md");

  expect(detailTitleValue()).toBe("A");
  expect(liveRegionText()).toContain("「A」を表示中");
});

test("column 同位置 drop (no-op) では LiveRegion が更新されない", async () => {
  mountApp();
  await openThreeColumnProject();

  const headers = container?.querySelectorAll<HTMLElement>(
    "[data-testid='column-header']",
  );
  const headerA = headers?.[0];
  const sectionA = container?.querySelector<HTMLElement>(
    "section[aria-label='A']",
  );
  const startEvent = createDragEvent("dragstart");
  await act(async () => {
    headerA?.dispatchEvent(startEvent);
  });
  const drop = createDragEvent("drop", {
    dataTransfer: startEvent.dataTransfer,
  });
  await act(async () => {
    sectionA?.dispatchEvent(drop);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(liveRegion()?.textContent).toBe("");
  expect(updateColumnsMock).not.toHaveBeenCalled();
});
