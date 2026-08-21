import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  emptyTrash,
  getTrashedTasks,
  purgeTrashedTask,
  restoreTrashedTask,
} from "@/lib/tauri";
import { ToastProvider } from "@/providers/ToastProvider";
import { Result } from "@/utils/result";
import { TrashSettingsTab } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getTrashedTasks: vi.fn(),
    restoreTrashedTask: vi.fn(),
    purgeTrashedTask: vi.fn(),
    emptyTrash: vi.fn(),
  };
});

const getTrashedTasksMock = vi.mocked(getTrashedTasks);
const restoreTrashedTaskMock = vi.mocked(restoreTrashedTask);
const purgeTrashedTaskMock = vi.mocked(purgeTrashedTask);
const emptyTrashMock = vi.mocked(emptyTrash);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const TRASHED = {
  filePath: "tasks/a.md",
  title: "タスクA",
  status: "Todo",
  deletedAt: "2026-08-19T12:00:00Z",
};

beforeEach(() => {
  getTrashedTasksMock.mockReset();
  restoreTrashedTaskMock.mockReset();
  purgeTrashedTaskMock.mockReset();
  emptyTrashMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/** TrashSettingsTab を ToastProvider 配下で描画する。 */
async function renderTab() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(ToastProvider, null, createElement(TrashSettingsTab)),
    );
  });
}

/** @param label - aria-label または textContent @returns 一致 button */
function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  );
}

test("ゴミ箱内タスクの一覧（タイトル / 元パス / 削除日時）を表示する", async () => {
  getTrashedTasksMock.mockResolvedValue(Result.ok({ tasks: [TRASHED] }));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });
  expect(container?.textContent).toContain("tasks/a.md");
  expect(container?.textContent).toContain("2026-08-19T12:00:00Z");
});

test("0 件のときは空状態を表示し「ゴミ箱を空にする」を無効化する", async () => {
  getTrashedTasksMock.mockResolvedValue(Result.ok({ tasks: [] }));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ゴミ箱は空です");
  });
  expect(buttonByLabel("ゴミ箱を空にする")?.disabled).toBe(true);
});

test("復元ボタンで restoreTrashedTask が呼ばれ一覧を取り直す", async () => {
  getTrashedTasksMock
    .mockResolvedValueOnce(Result.ok({ tasks: [TRASHED] }))
    .mockResolvedValueOnce(Result.ok({ tasks: [] }));
  restoreTrashedTaskMock.mockResolvedValue(
    Result.ok({ restoredFilePath: "tasks/a.md" }),
  );
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  await act(async () => {
    buttonByLabel("タスクA を復元")?.click();
  });

  expect(restoreTrashedTaskMock).toHaveBeenCalledWith({
    filePath: "tasks/a.md",
  });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("ゴミ箱は空です");
  });
});

test("完全削除は確認ダイアログを経て purgeTrashedTask を呼ぶ", async () => {
  getTrashedTasksMock
    .mockResolvedValueOnce(Result.ok({ tasks: [TRASHED] }))
    .mockResolvedValueOnce(Result.ok({ tasks: [] }));
  purgeTrashedTaskMock.mockResolvedValue(Result.ok(undefined));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  await act(async () => {
    buttonByLabel("タスクA を完全に削除")?.click();
  });
  expect(container?.textContent).toContain("タスクを完全に削除しますか？");
  // ダイアログ確定まで IPC は呼ばれない
  expect(purgeTrashedTaskMock).not.toHaveBeenCalled();

  const confirmButton = container?.querySelector<HTMLButtonElement>(
    "[data-testid='confirm-confirm-button']",
  );
  await act(async () => {
    confirmButton?.click();
  });

  expect(purgeTrashedTaskMock).toHaveBeenCalledWith({
    filePath: "tasks/a.md",
  });
});

test("ゴミ箱を空にするは確認ダイアログを経て emptyTrash を呼ぶ", async () => {
  getTrashedTasksMock
    .mockResolvedValueOnce(Result.ok({ tasks: [TRASHED] }))
    .mockResolvedValueOnce(Result.ok({ tasks: [] }));
  emptyTrashMock.mockResolvedValue(Result.ok(undefined));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  await act(async () => {
    buttonByLabel("ゴミ箱を空にする")?.click();
  });
  expect(container?.textContent).toContain("ゴミ箱を空にしますか？");
  expect(emptyTrashMock).not.toHaveBeenCalled();

  const confirmButton = container?.querySelector<HTMLButtonElement>(
    "[data-testid='confirm-confirm-button']",
  );
  await act(async () => {
    confirmButton?.click();
  });

  expect(emptyTrashMock).toHaveBeenCalledTimes(1);
});

test("確認ダイアログをキャンセルすると破壊的操作は実行されない", async () => {
  getTrashedTasksMock.mockResolvedValue(Result.ok({ tasks: [TRASHED] }));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  await act(async () => {
    buttonByLabel("タスクA を完全に削除")?.click();
  });
  const cancelButton = container?.querySelector<HTMLButtonElement>(
    "[data-testid='confirm-cancel-button']",
  );
  await act(async () => {
    cancelButton?.click();
  });

  expect(purgeTrashedTaskMock).not.toHaveBeenCalled();
  expect(container?.textContent).not.toContain("タスクを完全に削除しますか？");
});

test("取得失敗時はエラーを表示する", async () => {
  getTrashedTasksMock.mockResolvedValue(Result.err(new Error("fail") as never));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain(
      "ゴミ箱一覧を取得できませんでした",
    );
  });
});
