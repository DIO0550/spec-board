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
import {
  createTask as createTaskInvoke,
  deleteTask as deleteTaskInvoke,
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
  TauriError,
  updateColumns as updateColumnsInvoke,
  updateTask as updateTaskInvoke,
} from "@/lib/tauri";
import type { Task } from "@/types/task";
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
  };
});

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const createTaskMock = vi.mocked(createTaskInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);
const deleteTaskMock = vi.mocked(deleteTaskInvoke);
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
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
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

const taskA: Task = {
  id: "a",
  title: "A タスク",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/a.md",
};

const payload: OpenProjectPayload = {
  tasks: [taskA],
  columns: ["Todo", "Done"],
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
    Result.ok({ tasks: [], columns: ["Todo", "Done"] }),
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

// === DOM 経由の CRUD 結線テスト ===
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

const submitTaskCreateForm = (title: string): void => {
  const titleInput = querySelectorRequired<HTMLInputElement>(
    '[data-testid="task-form-title"]',
  );
  setInputValue(titleInput, title);
  const submitBtn = querySelectorRequired<HTMLButtonElement>(
    '[data-testid="task-form-submit"]',
  );
  submitBtn.click();
};

test("Board の '+追加' → Modal 送信 → createTask invoke が呼ばれ tasks に反映 + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();

  const created: Task = {
    id: "new",
    title: "新規タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/新規タスク.md",
  };
  createTaskMock.mockResolvedValueOnce(Result.ok(created));

  await act(async () => {
    clickColumnAddButton("Todo");
  });
  expect(container?.querySelector('[data-testid="task-form"]')).not.toBeNull();

  await act(async () => {
    submitTaskCreateForm("新規タスク");
  });
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

test("createTask 失敗時に TaskCreateModal が閉じない（onSubmit reject）", async () => {
  mountApp();
  await openSuccessfully();
  createTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io error")),
  );

  await act(async () => {
    clickColumnAddButton("Todo");
  });
  expect(container?.querySelector('[data-testid="task-form"]')).not.toBeNull();

  await act(async () => {
    submitTaskCreateForm("失敗するタスク");
  });
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
  expect(updateColumnsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      columns: expect.arrayContaining([
        expect.objectContaining({ name: "Backlog" }),
      ]),
    }),
  );
  expect(container?.textContent).toContain("Backlog");
  expect(container?.textContent).toContain("カラムを追加しました");
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

// === DetailPanel 経由の updateTask / deleteTask DOM テスト ===

const openDetailPanelForFirstTask = async (): Promise<void> => {
  // TaskCard は div role="button"。最初に見つかった card をクリック
  const card = querySelectorRequired<HTMLDivElement>('[role="button"]');
  await act(async () => {
    card.click();
  });
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

test("DetailPanel の status 変更 → updateTask invoke が呼ばれ + 成功 toast", async () => {
  mountApp();
  await openSuccessfully();

  await openDetailPanelForFirstTask();
  // 詳細パネルが開いている
  expect(
    container?.querySelector('[data-testid="status-select"]'),
  ).not.toBeNull();

  const updated: Task = { ...taskA, status: "Done" };
  updateTaskMock.mockResolvedValueOnce(Result.ok(updated));

  const statusSelect = querySelectorRequired<HTMLSelectElement>(
    '[data-testid="status-select"]',
  );
  await act(async () => {
    setSelectValue(statusSelect, "Done");
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

test("DetailPanel の status 変更失敗時 → updateTask invoke + エラー toast 表示", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailPanelForFirstTask();

  updateTaskMock.mockResolvedValueOnce(
    Result.err(new TauriError("IO_ERROR", "io fail")),
  );
  const statusSelect = querySelectorRequired<HTMLSelectElement>(
    '[data-testid="status-select"]',
  );
  await act(async () => {
    setSelectValue(statusSelect, "Done");
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(updateTaskMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain("タスクの更新に失敗しました");
  expect(container?.textContent).not.toContain("タスクを更新しました");
});

test("DetailPanel 削除 → deleteTask invoke が呼ばれ Board から消えて DetailPanel が閉じる", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailPanelForFirstTask();

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
  // DetailPanel が閉じる: status-select が DOM から消える
  expect(container?.querySelector('[data-testid="status-select"]')).toBeNull();
});

test("DetailPanel 削除失敗時 → deleteTask invoke + ConfirmDialog が閉じない (DeleteFlow が error 状態)", async () => {
  mountApp();
  await openSuccessfully();
  await openDetailPanelForFirstTask();

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
  // DetailPanel は閉じていない
  expect(
    container?.querySelector('[data-testid="status-select"]'),
  ).not.toBeNull();
  // ConfirmDialog も維持されている (DeleteFlow が error 状態 → isOpen=true)
  expect(
    container?.querySelector('[data-testid="confirm-dialog"]'),
  ).not.toBeNull();
});

test("プロジェクト切替: A で task 選択中に B を開いても stale UI state が leak しない (file-path 衝突 regression)", async () => {
  mountApp();
  await openSuccessfully();

  // A の最初の task をクリックして DetailPanel を開く
  await openDetailPanelForFirstTask();
  expect(
    container?.querySelector('[data-testid="status-select"]'),
  ).not.toBeNull();

  // 同じ filePath (tasks/a.md) を持つ別 project B を開く
  // B の task title は "B プロジェクトの A" として、A と区別する
  const taskAInProjectB: Task = {
    id: "a",
    title: "B プロジェクトの A",
    status: "Done",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
  };
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/project-b"));
  openProjectMock.mockResolvedValueOnce(
    Result.ok({ tasks: [taskAInProjectB], columns: ["Todo", "Done"] }),
  );
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });

  // B のレンダー時点で DetailPanel が閉じていることを確認
  // (render-phase reset により selectedTaskId が null になっているため、
  //  B の task A が誤って開かれない)
  expect(container?.querySelector('[data-testid="status-select"]')).toBeNull();
  // Board は B の task を表示している
  expect(container?.textContent).toContain("B プロジェクトの A");
});
