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
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/mime";
import {
  createTask as createTaskInvoke,
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  getConfigFiles as getConfigFilesInvoke,
  getLabels as getLabelsInvoke,
  getMilestones as getMilestonesInvoke,
  moveTask as moveTaskInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  updateColumns as updateColumnsInvoke,
  updateTask as updateTaskInvoke,
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
    getLabels: vi.fn(),
    getMilestones: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getConfigFiles: vi.fn(),
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
const getMilestonesMock = vi.mocked(getMilestonesInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);
const getConfigFilesMock = vi.mocked(getConfigFilesInvoke);
const updateColumnsMock = vi.mocked(updateColumnsInvoke);
const moveTaskMock = vi.mocked(moveTaskInvoke);

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
  localStorage.removeItem("spec-board:viewMode");
  openDirectoryDialogMock.mockReset();
  openProjectMock.mockReset();
  getColumnsMock.mockReset();
  // openProject 内 / updateColumns 内の defensive refetch で常に呼ばれる。
  // 既定では成功させて doneColumn を一貫して返し、テストごとに必要な範囲で上書きする。
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
  getLabelsMock.mockReset();
  // 設定画面のラベルタブが getLabels を読むため、既定で空一覧を返す。
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  getMilestonesMock.mockReset();
  getMilestonesMock.mockResolvedValue(
    Result.ok({ milestones: [], usageCounts: {} }),
  );
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
  getConfigFilesMock.mockReset();
  getConfigFilesMock.mockResolvedValue(
    Result.ok({
      files: [
        {
          id: "config",
          name: "config.json",
          path: ".spec-board/config.json",
          badge: "fixture",
          language: "JSON",
          content: "{}",
          generated: false,
        },
        {
          id: "guide",
          name: "GUIDE.md",
          path: ".spec-board/GUIDE.md",
          badge: "自動生成",
          language: "Markdown",
          content: "# GUIDE fixture",
          generated: true,
        },
      ],
    }),
  );
  updateColumnsMock.mockReset();
  moveTaskMock.mockReset();
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

const payload: OpenProjectPayload = {
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [taskA],
  columns: ["Todo", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
};

const mountApp = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(<App />);
  });
};

const clickHeaderOpenButton = () => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(buttons).find((b) => b.textContent === "開く") as
    | HTMLButtonElement
    | undefined;
  openBtn?.click();
};

const clickEmptyStateOpenButton = () => {
  const buttons = container?.querySelectorAll("main button") ?? [];
  const openBtn = Array.from(buttons).find(
    (b) => b.textContent === "プロジェクトを開く",
  ) as HTMLButtonElement | undefined;
  openBtn?.click();
};

const openSuccessfully = async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

test("初期マウント時に EmptyState (no-project) が表示される", () => {
  mountApp();
  expect(container?.textContent).toContain(
    "プロジェクトフォルダを選択して開始してください",
  );
});

test("HeaderBar の「開く」ボタンクリック → mock 経由で Board が表示される", async () => {
  mountApp();
  await openSuccessfully();
  expect(container?.textContent).toContain("A タスク");
});

test("EmptyState 中央の「開く」ボタンクリックでも同フローで Board へ遷移", async () => {
  mountApp();
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickEmptyStateOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent).toContain("A タスク");
});

test("loaded で tasks が 0 件のとき EmptyState type=empty-project が表示される", async () => {
  mountApp();
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [],
      columns: ["Todo", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent).toContain("タスクがありません");
});

test("dialog cancel 時は state 不変、toast なし", async () => {
  mountApp();
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok(null));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent).toContain(
    "プロジェクトフォルダを選択して開始してください",
  );
  expect(openProjectMock).not.toHaveBeenCalled();
});

test("invoke 失敗時に error toast 表示、EmptyState のまま", async () => {
  mountApp();
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.err(new TauriError("NOT_FOUND", "見つかりません: /p")),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent).toContain("見つかりません: /p");
});

// === DOM 経由の task command 結線テスト ===
//
// これらは App コンポーネントの handler が useProject method を正しく
// 呼び出し、その結果が UI に反映されるかを実 DOM イベント経由で検証する。

const clickColumnAddButton = (columnName: string): void => {
  const btn = container?.querySelector(
    `button[aria-label="${columnName}に追加"]`,
  ) as HTMLButtonElement | null;
  btn?.click();
};

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const querySelectorRequired = <T extends Element>(selector: string): T => {
  const el = container?.querySelector(selector) as T | null;
  expect(el).not.toBeNull();
  return el as T;
};

const submitTaskCreateForm = async (title: string): Promise<void> => {
  const titleInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="task-form-title"]',
  );
  // タイトル入力 → onValuesChange の effect を flush（footer の作成ボタンが活性化する）。
  await act(async () => {
    setInputValue(titleInput, title);
  });
  await act(async () => {
    await Promise.resolve();
  });
  // 作成ボタンは form の外（footer）にあり、formRef 経由の requestSubmit で送信する。
  const submitBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="task-form-submit"]',
  );
  await act(async () => {
    submitBtn.click();
  });
};

test("Board の '+追加' → Modal 送信 → createTask invoke が呼ばれ tasks に反映 + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();

  const created: Task = Task.fromPayload({
    id: "new",
    title: "新規タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/新規タスク.md",
  });
  createTaskMock.mockResolvedValueOnce(Result.ok(created));

  await act(async () => {
    clickColumnAddButton("Todo");
  });
  expect(container?.querySelector('[data-testid="task-form"]')).not.toBeNull();

  await submitTaskCreateForm("新規タスク");
  await act(async () => {
    await Promise.resolve();
  });

  expect(createTaskMock).toHaveBeenCalledTimes(1);
  expect(createTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({ title: "新規タスク", status: "Todo" }),
  );
  expect(container?.textContent).toContain("新規タスク");
  expect(container?.textContent).toContain("タスクを作成しました");
});

test("createTask 失敗時に作成画面が閉じない（onSubmit reject）", async () => {
  mountApp();
  await openSuccessfully();
  createTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io error")),
  );

  await act(async () => {
    clickColumnAddButton("Todo");
  });
  expect(container?.querySelector('[data-testid="task-form"]')).not.toBeNull();

  await submitTaskCreateForm("失敗するタスク");
  await act(async () => {
    await Promise.resolve();
  });

  expect(createTaskMock).toHaveBeenCalledTimes(1);
  // モーダルが閉じていない (form がまだ DOM に残る)
  expect(container?.querySelector('[data-testid="task-form"]')).not.toBeNull();
  expect(container?.textContent).not.toContain("タスクを作成しました");
});

const pressEnter = (input: HTMLInputElement): void => {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
};

const openAddColumnEditor = async (): Promise<void> => {
  const trigger = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="add-column-button"]',
  );
  await act(async () => {
    trigger.click();
  });
};

test("AddColumnButton で新カラム追加 → updateColumns invoke が呼ばれ Board に反映 + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));

  await openAddColumnEditor();
  const columnInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="add-column-input"]',
  );
  setInputValue(columnInput, "Backlog");
  await act(async () => {
    pressEnter(columnInput);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
  const columns = updateColumnsMock.mock.calls[0]?.[0].columns ?? [];
  expect(columns).toHaveLength(3);
  expect(columns[columns.length - 1]).toEqual(
    expect.objectContaining({ name: "Backlog", order: 2 }),
  );
  expect(container?.textContent).toContain("Backlog");
  expect(container?.textContent).toContain("カラムを追加しました");
});

test("AddColumnButton で invoke 失敗時 → エラー toast + editor 維持", async () => {
  mountApp();
  await openSuccessfully();
  updateColumnsMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  await openAddColumnEditor();
  const columnInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="add-column-input"]',
  );
  setInputValue(columnInput, "Backlog");
  await act(async () => {
    pressEnter(columnInput);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateColumnsMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain("カラムの追加に失敗しました");
  expect(container?.textContent).toContain("io fail");

  const stillInput = container?.querySelector<HTMLInputElement>(
    '[data-testid="add-column-input"]',
  );
  expect(stillInput).not.toBeNull();
  expect(
    container?.querySelector('[data-testid="add-column-button"]'),
  ).toBeNull();
  expect(stillInput?.value).toBe("Backlog");
  expect(stillInput?.disabled).toBe(false);
});

test("AddColumnButton で重複名を入力 → updateColumns invoke は呼ばれず重複エラーを表示", async () => {
  mountApp();
  await openSuccessfully();

  await openAddColumnEditor();
  const columnInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="add-column-input"]',
  );
  setInputValue(columnInput, "Todo"); // 既存カラム名
  await act(async () => {
    pressEnter(columnInput);
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateColumnsMock).not.toHaveBeenCalled();
  expect(container?.textContent).toContain("同じ名前のカラムが既に存在します");
});

// === DetailScreen 経由の updateTask / deleteTask DOM テスト ===

const openDetailScreenForFirstTask = async (): Promise<void> => {
  const card = querySelectorRequired<HTMLDivElement>(
    '[data-testid="task-card"]',
  );
  await act(async () => {
    card.click();
  });
};

test("DetailScreen の status 変更 → updateTask invoke が呼ばれ + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();

  await openDetailScreenForFirstTask();
  // 詳細（DetailScreen）が開いている
  expect(
    container?.querySelector('[data-testid="status-field"]'),
  ).not.toBeNull();

  const updated: Task = { ...taskA, status: "Done" };
  updateTaskMock.mockResolvedValueOnce(Result.ok(updated));

  await act(async () => {
    querySelectorRequired<HTMLElement>('[data-testid="status-field"]').click();
  });
  await act(async () => {
    querySelectorRequired<HTMLElement>(
      '[data-testid="status-field-option-Done"]',
    ).click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(updateTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: "tasks/a.md", status: "Done" }),
  );
  expect(container?.textContent).toContain("タスクを更新しました");
});

test("DetailScreen タイトル inline 編集 Enter → updateTask invoke が { filePath, title } で呼ばれ + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailScreenForFirstTask();

  const updatedTitle = "新しいタイトル";
  const updated: Task = { ...taskA, title: updatedTitle };
  updateTaskMock.mockResolvedValueOnce(Result.ok(updated));

  const titleDisplay = querySelectorRequired<HTMLInputElement>(
    '[data-testid="editable-text-display"]',
  );
  await act(async () => {
    titleDisplay.click();
  });
  const titleInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="editable-text-input"]',
  );
  await act(async () => {
    setInputValue(titleInput, updatedTitle);
  });
  await act(async () => {
    titleInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(updateTaskMock).toHaveBeenCalledWith(
    expect.objectContaining({ filePath: "tasks/a.md", title: updatedTitle }),
  );
  expect(container?.textContent).toContain("タスクを更新しました");
});

test("DetailScreen の status 変更失敗時 → updateTask invoke + エラー toast 表示", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailScreenForFirstTask();

  updateTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );
  await act(async () => {
    querySelectorRequired<HTMLElement>('[data-testid="status-field"]').click();
  });
  await act(async () => {
    querySelectorRequired<HTMLElement>(
      '[data-testid="status-field-option-Done"]',
    ).click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain("タスクの更新に失敗しました");
  expect(container?.textContent).not.toContain("タスクを更新しました");
});

test("DetailScreen 削除 → deleteTask invoke が呼ばれ Board から消えて DetailScreen が閉じる", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailScreenForFirstTask();

  deleteTaskMock.mockResolvedValueOnce(Result.ok(undefined));

  const deleteBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="detail-delete-button"]',
  );
  await act(async () => {
    deleteBtn.click();
  });

  const confirmBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="confirm-confirm-button"]',
  );
  await act(async () => {
    confirmBtn.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(deleteTaskMock).toHaveBeenCalledTimes(1);
  expect(deleteTaskMock).toHaveBeenCalledWith({ filePath: "tasks/a.md" });
  expect(container?.textContent).toContain("タスクを削除しました");
  // DetailScreen が閉じる: status-field が DOM から消える
  expect(container?.querySelector('[data-testid="status-field"]')).toBeNull();
});

test("DetailScreen 削除失敗時 → deleteTask invoke + ConfirmDialog が閉じない (DeleteFlow が error 状態)", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailScreenForFirstTask();

  deleteTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("PERMISSION_DENIED", "perm fail")),
  );

  const deleteBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="detail-delete-button"]',
  );
  await act(async () => {
    deleteBtn.click();
  });
  const confirmBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="confirm-confirm-button"]',
  );
  await act(async () => {
    confirmBtn.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(deleteTaskMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain("タスクの削除に失敗しました");
  // DetailScreen は閉じていない
  expect(
    container?.querySelector('[data-testid="status-field"]'),
  ).not.toBeNull();
  // ConfirmDialog も維持されている (DeleteFlow が error 状態 → isOpen=true)
  expect(
    container?.querySelector('[data-testid="confirm-dialog"]'),
  ).not.toBeNull();
});

test("プロジェクト切替: A で task 選択中に B を開いても stale UI state が leak しない (file-path 衝突 regression)", async () => {
  mountApp();
  await openSuccessfully();

  // A の最初の task をクリックして DetailScreen を開く
  await openDetailScreenForFirstTask();
  expect(
    container?.querySelector('[data-testid="status-field"]'),
  ).not.toBeNull();

  // 同じ filePath (tasks/a.md) を持つ別 project B を開く
  // B の task title は "B プロジェクトの A" として、A と区別する
  const taskAInProjectB: Task = Task.fromPayload({
    id: "a",
    title: "B プロジェクトの A",
    status: "Done",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
  });
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/project-b"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      loadWarnings: [],
      session: WATCHER_SESSION_FIXTURE,
      tasks: [taskAInProjectB],
      columns: ["Todo", "Done"],
      projections: new Map(),
      milestoneProjections: new Map(),
      taskTree: [],
    }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });

  // B のレンダー時点で DetailScreen が閉じていることを確認
  // (AppShell の render-phase reset (他 state) と AppViewProvider key remount (view)
  //  の組み合わせで selectedTaskId が null になっているため、B の task A が誤って開かれない)
  expect(container?.querySelector('[data-testid="status-field"]')).toBeNull();
  // Board は B の task を表示している
  expect(container?.textContent).toContain("B プロジェクトの A");
});

test("再 open の loading 中は旧 Board を非表示にして loading を表示する", async () => {
  mountApp();
  await openSuccessfully();
  expect(container?.textContent).toContain("A タスク");

  // 再 open の dialog/invoke を pending にして loading 中を観察
  let resolveOpen!: (
    r: { ok: true; value: typeof payload } | { ok: false; error: TauriError },
  ) => void;
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p2"));
  openProjectMock.mockReturnValueOnce(
    new Promise((r) => {
      resolveOpen = r;
    }),
  );

  await act(async () => {
    clickHeaderOpenButton();
  });
  // この時点で旧 Board は非表示になり、loading が表示される
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent).toContain("読み込み中…");
  expect(container?.textContent).not.toContain("A タスク");

  // 失敗後は互換性のため旧 project に復元する
  await act(async () => {
    resolveOpen({ ok: false, error: new TauriError("UNKNOWN", "fail") });
    await Promise.resolve();
  });
  expect(container?.textContent).toContain("A タスク");
});

/**
 * Board の TaskCard を dragstart → Done カラム section へ drop して
 * App.handleTaskDrop の onTaskDrop callback を発火させる。
 */
const dropFirstCardToDone = async () => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  const doneSection = container?.querySelector<HTMLElement>(
    "section[aria-label='Done']",
  );
  expect(card).not.toBeNull();
  expect(doneSection).not.toBeNull();
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

test("moveTask 失敗（generic）→ 「タスクの移動に失敗しました」 toast を表示", async () => {
  mountApp();
  await openSuccessfully();

  moveTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );

  await dropFirstCardToDone();

  expect(moveTaskMock).toHaveBeenCalledTimes(1);
  expect(updateTaskMock).not.toHaveBeenCalled();
  expect(container?.textContent).toContain("タスクの移動に失敗しました");
});

test("moveTask 成功 → カードが Done カラムに移り、エラー toast は出ない", async () => {
  mountApp();
  await openSuccessfully();

  const movedA: Task = { ...taskA, status: "Done" };
  moveTaskMock.mockResolvedValueOnce(Result.ok(movedA));

  await dropFirstCardToDone();

  expect(moveTaskMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).not.toContain("タスクの移動に失敗しました");
});

const parentTask: Task = Task.fromPayload({
  id: "p",
  title: "親タスクABC",
  status: "Todo",
  labels: [],
  links: [],
  children: ["tasks/child.md"],
  reverseLinks: [],
  body: "",
  filePath: "tasks/parent.md",
});

const childTask: Task = Task.fromPayload({
  id: "c",
  title: "子タスクXYZ",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/child.md",
  parent: "tasks/parent.md",
});

const parentChildPayload: OpenProjectPayload = {
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks: [parentTask, childTask],
  columns: ["Todo", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
};

const openParentChildProject = async () => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(parentChildPayload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const dialogTitleValue = (): string | null | undefined => {
  const screen = container?.querySelector('section[aria-label="タスク詳細"]');
  const titleInput = screen?.querySelector(
    '[data-testid="editable-text-display"]',
  ) as HTMLInputElement | null;
  return titleInput?.value;
};

test("子タスクのカードをクリック → DetailScreen 表示 → 親リンククリックで親タスクの DetailScreen に切り替わる", async () => {
  mountApp();
  await openParentChildProject();

  const cards = Array.from(
    container?.querySelectorAll<HTMLDivElement>('[data-testid="task-card"]') ??
      [],
  );
  const childCard = cards.find(
    (card) =>
      card.querySelector('[data-testid="task-card-title"]')?.textContent ===
      "子タスクXYZ",
  );
  expect(childCard).toBeDefined();

  await act(async () => {
    childCard?.click();
  });

  // 誤選択の早期検出: DetailScreen が子タスクで開いていることを確認
  expect(
    container?.querySelector('section[aria-label="タスク詳細"]'),
  ).not.toBeNull();
  expect(dialogTitleValue()).toBe("子タスクXYZ");

  const parentLink = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  expect(parentLink.textContent).toBe("親: 親タスクABC");

  await act(async () => {
    parentLink.click();
  });

  expect(dialogTitleValue()).toBe("親タスクABC");
  // 親タスクには親が無いので ParentLink は描画されない
  expect(
    container?.querySelector('[data-testid="detail-parent-link"]'),
  ).toBeNull();
});

// === 画面区分（view）/ 設定画面遷移の統合テスト ===

const clickHeaderSettingsButton = () => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const btn = Array.from(buttons).find((b) => b.textContent === "設定") as
    | HTMLButtonElement
    | undefined;
  btn?.click();
};

const clickHeaderBackButton = () => {
  const buttons = container?.querySelectorAll("header button") ?? [];
  const btn = Array.from(buttons).find(
    (b) => b.textContent === "ボードへ戻る",
  ) as HTMLButtonElement | undefined;
  btn?.click();
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

test("HeaderBar「設定」click で SettingsScreen（SubNav/ラベルタブ）が main に表示される", async () => {
  mountApp();
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  expect(container?.querySelector('[role="tablist"]')).not.toBeNull();
  const tab = container?.querySelector('[role="tab"]');
  expect(tab?.textContent).toBe("ラベル 0");
});

test("settings 表示中の「ボードへ戻る」click で board（EmptyState）に復帰する", async () => {
  mountApp();
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  expect(container?.querySelector('[role="tablist"]')).not.toBeNull();
  await act(async () => {
    clickHeaderBackButton();
  });
  await flush();
  expect(container?.querySelector('[role="tablist"]')).toBeNull();
  expect(container?.textContent).toContain(
    "プロジェクトフォルダを選択して開始してください",
  );
});

test("読込→settings→board 往復で読込済み board 状態（A タスク）が保持される", async () => {
  mountApp();
  await openSuccessfully();
  expect(container?.textContent).toContain("A タスク");
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  // settings 表示中は main の board が settings に差し替えられる
  // （サイドバーのファイルツリーには常時タスク名が出るため main に絞って確認する）
  expect(container?.querySelector("main")?.textContent).not.toContain(
    "A タスク",
  );
  await act(async () => {
    clickHeaderBackButton();
  });
  await flush();
  // board 状態は据え置き保持されており再表示される
  expect(container?.textContent).toContain("A タスク");
});

test("読込済みsettingsは実project情報とstatusを表示し保存・戻るをAppへ接続する", async () => {
  updateColumnsMock.mockResolvedValueOnce(Result.ok(undefined));
  mountApp();
  await openSuccessfully();
  await act(async () => clickHeaderSettingsButton());
  await flush();

  const main = container?.querySelector("main");
  expect(main?.textContent).toContain("p");
  expect(container?.querySelector("header")?.textContent).toContain("1 files");
  expect(main?.textContent).not.toContain("payments-service");

  const statusTab = Array.from(
    main?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
  ).find((tab) => tab.textContent?.includes("ステータス"));
  await act(async () => statusTab?.click());
  const move = Array.from(
    main?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.getAttribute("aria-label") === "Done を上へ");
  act(() => move?.click());
  const save = Array.from(
    main?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent === "変更を保存");
  await act(async () => save?.click());
  expect(updateColumnsMock).toHaveBeenCalledTimes(1);

  const back = Array.from(
    main?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent?.includes("戻る"));
  await act(async () => back?.click());
  expect(container?.querySelector("main")?.textContent).toContain("A タスク");
});

test("loaded HeaderのGUIDE.mdからSettings ConfigのGUIDEを直接表示する", async () => {
  mountApp();
  await openSuccessfully();
  const guide = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
  ).find((button) => button.textContent === "GUIDE.md");
  await act(async () => guide?.click());
  await flush();
  expect(container?.querySelector("main")?.textContent).toContain(
    "# GUIDE fixture",
  );
});

test("loaded Calendarの日付追加から期限を初期入力したTask Createへ遷移する", async () => {
  mountApp();
  await openSuccessfully();
  const calendarTab = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
  ).find((tab) => tab.textContent === "カレンダー");
  await act(async () => calendarTab?.click());
  const add = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) =>
    button.getAttribute("aria-label")?.endsWith("にタスクを追加"),
  );
  const due = add?.getAttribute("aria-label")?.slice(0, 10);
  await act(async () => add?.click());
  expect(
    container?.querySelector<HTMLInputElement>('input[type="date"]')?.value,
  ).toBe(due);
});

test("loaded Milestoneの所属taskをクリックしてDetailへ遷移する", async () => {
  const milestoneTask = Task.fromPayload({
    id: "a",
    title: "A タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
    milestone: "v1",
  });
  getMilestonesMock.mockResolvedValue(
    Result.ok({
      milestones: [
        {
          name: "v1",
          title: "Version 1",
          description: "統合fixture",
          due: "2026-12-31",
          state: "open",
          order: 0,
        },
      ],
      usageCounts: { v1: 1 },
    }),
  );
  mountApp();
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({
      ...payload,
      tasks: [milestoneTask],
      milestoneProjections: new Map([
        [
          "v1",
          {
            done: 0,
            total: 1,
            taskFilePaths: [milestoneTask.filePath],
          },
        ],
      ]),
    }),
  );
  await act(async () => clickHeaderOpenButton());
  await flush();
  const milestone = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("header button") ?? [],
  ).find((button) => button.textContent === "マイルストーン");
  await act(async () => milestone?.click());
  await flush();
  const milestoneRow = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("main button") ?? [],
  ).find((button) => button.textContent?.includes("Version 1"));
  await act(async () => milestoneRow?.click());
  const taskButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("main button") ?? [],
  ).find((button) => button.textContent?.includes("A タスク"));
  await act(async () => taskButton?.click());
  expect(
    container?.querySelector('section[aria-label="タスク詳細"]'),
  ).not.toBeNull();
});

test("未読込（EmptyState）で settings→戻るしてもクラッシュせず EmptyState に復帰する", async () => {
  mountApp();
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  await act(async () => {
    clickHeaderBackButton();
  });
  await flush();
  expect(container?.textContent).toContain(
    "プロジェクトフォルダを選択して開始してください",
  );
});

test("detail 表示中に settings へ遷移すると DetailScreen が非表示になり、board 復帰でも再表示されない（detail と settings は排他・選択解除）", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailScreenForFirstTask();
  expect(
    container?.querySelector('section[aria-label="タスク詳細"]'),
  ).not.toBeNull();
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  expect(
    container?.querySelector('section[aria-label="タスク詳細"]'),
  ).toBeNull();
  await act(async () => {
    clickHeaderBackButton();
  });
  await flush();
  // detail と settings は排他で、settings 遷移時に選択を解除するため
  // board 復帰後に detail は再表示されない（board がクリーン表示される）。
  expect(
    container?.querySelector('section[aria-label="タスク詳細"]'),
  ).toBeNull();
  expect(container?.textContent).toContain("A タスク");
});

test("settings 表示中に HeaderBar「開く」を押すと board に戻り openProject が呼ばれる", async () => {
  mountApp();
  await act(async () => {
    clickHeaderSettingsButton();
  });
  await flush();
  expect(container?.querySelector('[role="tablist"]')).not.toBeNull();

  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await flush();

  // board 復帰後はビュー切替タブが出る一方、設定固有の「ラベル」タブは消える
  const tabTexts = Array.from(
    container?.querySelectorAll('[role="tab"]') ?? [],
  ).map((tab) => tab.textContent);
  expect(tabTexts).not.toContain("ラベル");
  expect(openProjectMock).toHaveBeenCalled();
  expect(container?.textContent).toContain("A タスク");
});

test("Ctrl+Kでグローバル検索を開きEscapeで閉じる", async () => {
  mountApp();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
  });
  expect(
    container?.querySelector('[role="dialog"][aria-label="グローバル検索"]'),
  ).not.toBeNull();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(
    container?.querySelector('[role="dialog"][aria-label="グローバル検索"]'),
  ).toBeNull();
});
