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
  addLink as addLinkInvoke,
  getColumns as getColumnsInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
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
    addLink: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const openDirectoryDialogMock = vi.mocked(openDirectoryDialog);
const openProjectMock = vi.mocked(openProjectInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);
const addLinkMock = vi.mocked(addLinkInvoke);

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

const makeTaskA = (): Task =>
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
  });

const makeTaskB = (): Task =>
  Task.fromPayload({
    id: "b",
    title: "B",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/b.md",
  });

const makePayload = (tasks: Task[]): OpenProjectPayload => ({
  loadWarnings: [],
  session: WATCHER_SESSION_FIXTURE,
  tasks,
  columns: ["Todo", "Done"],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
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
  addLinkMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
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
    await Promise.resolve();
  });
};

const openProjectWith = async (tasks: Task[]): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(makePayload(tasks)));
  await clickHeaderOpenButton();
};

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

const openLinkPopover = (): void => {
  const btn = document.querySelector(
    '[data-testid="links-section-add-button"]',
  ) as HTMLButtonElement | null;
  act(() => {
    btn?.click();
  });
};

const selectCandidate = async (taskId: string): Promise<void> => {
  const option = document.querySelector(
    `[data-testid="links-section-option-${taskId}"]`,
  ) as HTMLButtonElement | null;
  await act(async () => {
    option?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
  // 長い Promise チェーン（LinksSection → handleAddLink → useProject.addLink
  // → addLinkAction → enqueueProjectCommand → addLink IPC）を解決するため複数 tick 流す。
  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });
};

const queryLiveRegionText = (): string =>
  document.querySelector('[data-testid="live-region"]')?.textContent ?? "";

test("source に link 追加後、target を開くと reverseLinkedFilePaths に source が反映されている（楽観 dispatch の end-to-end）", async () => {
  const taskA = makeTaskA();
  const taskB = makeTaskB();
  // 成功 invoke: source A の links に B を含む canonical Task を返す。
  addLinkMock.mockResolvedValue(
    Result.ok(
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
        extras: {},
        warnings: [],
      }),
    ),
  );

  mountApp();
  await openProjectWith([taskA, taskB]);

  // A を開いて B へのリンクを追加
  clickTaskCard("A");
  openLinkPopover();
  await selectCandidate("b");

  // detail（A）から board へ戻り、B を開いて reverseLinkedFilePaths に A が
  // 含まれていることを確認する。
  const backBtn = document.querySelector(
    '[data-testid="detail-back-button"]',
  ) as HTMLButtonElement | null;
  act(() => {
    backBtn?.click();
  });
  clickTaskCard("B");

  const reverseLi = document.querySelector(
    'li[data-path="tasks/a.md"][data-testid^="links-section-reverse-"]',
  );
  expect(reverseLi).toBeTruthy();
});

test("addLink 成功で aria-live に成功 announce が出る", async () => {
  const taskA = makeTaskA();
  const taskB = makeTaskB();
  addLinkMock.mockResolvedValue(
    Result.ok(
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
        extras: {},
        warnings: [],
      }),
    ),
  );

  mountApp();
  await openProjectWith([taskA, taskB]);
  clickTaskCard("A");
  openLinkPopover();
  await selectCandidate("b");

  expect(queryLiveRegionText()).toContain("「A」に「B」をリンクしました");
});

test("addLink 失敗で toast + 取り消し announce が出る", async () => {
  const taskA = makeTaskA();
  const taskB = makeTaskB();
  addLinkMock.mockResolvedValue(Result.err(TauriError.from(new Error("io"))));

  mountApp();
  await openProjectWith([taskA, taskB]);
  clickTaskCard("A");
  openLinkPopover();
  await selectCandidate("b");

  expect(queryLiveRegionText()).toContain(
    "「A」への「B」のリンク追加を取り消しました",
  );
});
