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
  getLabels as getLabelsInvoke,
  getMilestones as getMilestonesInvoke,
  type OpenProjectPayload,
  openDirectoryDialog,
  openProject as openProjectInvoke,
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
    getMilestones: vi.fn(),
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
const getMilestonesMock = vi.mocked(getMilestonesInvoke);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previous: boolean | undefined;
beforeAll(() => {
  previous = reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
});

const taskBug: Task = Task.fromPayload({
  id: "bug-1",
  title: "Bug タスク",
  status: "Todo",
  labels: ["bug"],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/bug-1.md",
});
const taskFeature: Task = Task.fromPayload({
  id: "feat-1",
  title: "Feature タスク",
  status: "Todo",
  labels: ["feature"],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/feat-1.md",
});

const payload: OpenProjectPayload = {
  tasks: [taskBug, taskFeature],
  columns: ["Todo", "Done"],
};

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
  getLabelsMock.mockReset();
  getLabelsMock.mockResolvedValue(
    Result.ok({
      labels: [{ name: "bug" }, { name: "feature" }],
      // BE 由来の usageCounts。App 側で live 集計に上書きされる。
      usageCounts: { bug: 1, feature: 1 },
    }),
  );
  getMilestonesMock.mockReset();
  getMilestonesMock.mockResolvedValue(
    Result.ok({ milestones: [], usageCounts: {} }),
  );
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

const openProject = async (): Promise<void> => {
  openDirectoryDialogMock.mockResolvedValueOnce(Result.ok("/p"));
  openProjectMock.mockResolvedValueOnce(Result.ok(payload));
  const headerButtons = container?.querySelectorAll("header button") ?? [];
  const openBtn = Array.from(headerButtons).find(
    (b) => b.textContent === "開く",
  ) as HTMLButtonElement | undefined;
  await act(async () => {
    openBtn?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const clickButtonByLabel = async (label: string): Promise<void> => {
  const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement | undefined;
  await act(async () => {
    btn?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
};

test("ラベル設定タブの使用数リンク → board へ遷移しそのラベルでフィルタされる", async () => {
  mountApp();
  await openProject();
  // 初期は board。Bug / Feature 両方のタスクが見えている。
  expect(container?.textContent).toContain("Bug タスク");
  expect(container?.textContent).toContain("Feature タスク");

  // 設定画面 → ラベルタブ
  await clickButtonByLabel("設定");
  // ラベル設定タブのテーブルに bug の使用数リンクが表示される
  const usageLink = container?.querySelector(
    '[data-testid="label-usage-link"]',
  ) as HTMLButtonElement | null;
  expect(usageLink).not.toBeNull();
  expect(usageLink?.textContent).toContain("1");

  await act(async () => {
    usageLink?.click();
  });
  await act(async () => {
    await Promise.resolve();
  });

  // Board へ遷移し、bug ラベルだけで絞り込まれていること
  expect(container?.textContent).toContain("Bug タスク");
  expect(container?.textContent).not.toContain("Feature タスク");
});
