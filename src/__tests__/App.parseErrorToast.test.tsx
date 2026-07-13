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
  getColumns as getColumnsInvoke,
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
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    updateColumns: vi.fn(),
    updateCardOrder: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const updateTaskMock = vi.mocked(updateTaskInvoke);

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
  updateTaskMock.mockReset();
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
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

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

const taskWithParseError = Task.fromPayload({
  id: "x",
  title: "X",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/x.md",
  warnings: [
    {
      code: "invalidStatusUsedDefault",
      field: "status",
      message: "invalid status, used default",
    },
  ],
});

const taskClean = Task.fromPayload({
  id: "y",
  title: "Y",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/y.md",
});

const taskWithBrokenLink = Task.fromPayload({
  id: "z",
  title: "Z",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/z.md",
  parent: "tasks/missing.md",
});

const payloadWithParseError: OpenProjectPayload = {
  tasks: [taskWithParseError],
  columns: ["Todo", "Done"],
};
const payloadClean: OpenProjectPayload = {
  tasks: [taskClean],
  columns: ["Todo", "Done"],
};
const payloadWithBoth: OpenProjectPayload = {
  tasks: [taskWithParseError, taskWithBrokenLink],
  columns: ["Todo", "Done"],
};

const openProjectFlow = async (
  pathArg: string,
  payload: OpenProjectPayload,
) => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok(pathArg));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  await act(async () => {
    clickHeaderOpenButton();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const warningToastTexts = (): string[] =>
  Array.from(
    container?.querySelectorAll('[data-testid="toast-warning"]') ?? [],
  ).map((el) => el.textContent ?? "");

const parseErrorToastCount = (): number =>
  warningToastTexts().filter((t) => t.includes("パースエラー")).length;

/**
 * 先頭の TaskCard を click して DetailScreen を開く。
 */
const openDetailScreen = (): void => {
  const card = container?.querySelector<HTMLElement>(
    "[data-testid='task-card']",
  );
  act(() => {
    card?.click();
  });
};

/**
 * ステータス popover を開いて指定カラムの option を選び、楽観 dispatch の microtask を 1 度 flush する。
 * 同一 loadedPath を保ったまま tasks state を更新するための操作。
 *
 * @param value 選択するカラム名
 */
const changeStatus = async (value: string): Promise<void> => {
  await act(async () => {
    (
      document.querySelector('[data-testid="status-field"]') as HTMLElement
    ).click();
  });
  await act(async () => {
    (
      document.querySelector(
        `[data-testid="status-field-option-${value}"]`,
      ) as HTMLElement
    ).click();
    await Promise.resolve();
  });
};

test("初回 loadedPath 到達かつパースエラー N >= 1: warning Toast が 1 回発火", async () => {
  mountApp();
  await openProjectFlow("/p", payloadWithParseError);
  const texts = warningToastTexts();
  expect(texts.some((t) => t.includes("パースエラーが 1 件あります"))).toBe(
    true,
  );
});

test("パースエラー 0 件: パースエラー Toast 発火なし", async () => {
  mountApp();
  await openProjectFlow("/p", payloadClean);
  const texts = warningToastTexts();
  expect(texts.some((t) => t.includes("パースエラー"))).toBe(false);
});

test("別 loadedPath に切替後 N >= 1: 再度 Toast 発火", async () => {
  mountApp();
  await openProjectFlow("/p1", payloadClean);
  expect(warningToastTexts().some((t) => t.includes("パースエラー"))).toBe(
    false,
  );
  await openProjectFlow("/p2", payloadWithParseError);
  expect(
    warningToastTexts().some((t) => t.includes("パースエラーが 1 件あります")),
  ).toBe(true);
});

test("パースエラーとリンク切れが両方ある: 両方の warning Toast が発火する", async () => {
  mountApp();
  await openProjectFlow("/p", payloadWithBoth);
  const texts = warningToastTexts();
  expect(texts.some((t) => t.includes("パースエラーが 1 件あります"))).toBe(
    true,
  );
  expect(texts.some((t) => t.includes("リンク切れが 1 件あります"))).toBe(true);
});

test("同一 loadedPath を保ったまま tasks を更新してもパースエラー Toast は再発火しない", async () => {
  mountApp();
  await openProjectFlow("/p", payloadWithParseError);
  expect(parseErrorToastCount()).toBe(1);

  // loading を経由せず（同一 loadedPath のまま）tasks state を更新する。
  // StatusSelect 操作 → updateTask の楽観反映で tasks が差し替わるが、
  // parseErrorToastFiredRef.current === loadedPath のため再発火しない。
  openDetailScreen();
  updateTaskMock.mockResolvedValueOnce(
    Result.ok({ ...taskWithParseError, status: "Done" }),
  );
  await changeStatus("Done");
  await act(async () => {
    await Promise.resolve();
  });

  expect(parseErrorToastCount()).toBe(1);
});
