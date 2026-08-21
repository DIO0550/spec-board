import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getArchivedTasks, unarchiveTask } from "@/lib/tauri";
import { ToastProvider } from "@/providers/ToastProvider";
import { Result } from "@/utils/result";
import { ArchiveSettingsTab } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getArchivedTasks: vi.fn(),
    unarchiveTask: vi.fn(),
  };
});

const getArchivedTasksMock = vi.mocked(getArchivedTasks);
const unarchiveTaskMock = vi.mocked(unarchiveTask);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getArchivedTasksMock.mockReset();
  unarchiveTaskMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/** ArchiveSettingsTab を ToastProvider 配下で描画する。 */
async function renderTab() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(ToastProvider, null, createElement(ArchiveSettingsTab)),
    );
  });
}

test("アーカイブ済みタスクの一覧（タイトル / ステータス / 元パス）を表示する", async () => {
  getArchivedTasksMock.mockResolvedValue(
    Result.ok({
      tasks: [
        { filePath: "tasks/a.md", title: "タスクA", status: "Done" },
        { filePath: "tasks/b.md", title: "タスクB" },
      ],
    }),
  );
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });
  expect(container?.textContent).toContain("tasks/a.md");
  expect(container?.textContent).toContain("Done");
  expect(container?.textContent).toContain("タスクB");
  expect(container?.textContent).toContain("2 件");
});

test("0 件のときは空状態メッセージを表示する", async () => {
  getArchivedTasksMock.mockResolvedValue(Result.ok({ tasks: [] }));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain(
      "アーカイブされたタスクはありません",
    );
  });
});

test("取得失敗時はエラーを表示する", async () => {
  getArchivedTasksMock.mockResolvedValue(
    Result.err(new Error("fail") as never),
  );
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain(
      "アーカイブ一覧を取得できませんでした",
    );
  });
});

test("復元ボタンで unarchiveTask が呼ばれ、一覧を取り直す", async () => {
  getArchivedTasksMock
    .mockResolvedValueOnce(
      Result.ok({
        tasks: [{ filePath: "tasks/a.md", title: "タスクA", status: "Done" }],
      }),
    )
    .mockResolvedValueOnce(Result.ok({ tasks: [] }));
  unarchiveTaskMock.mockResolvedValue(
    Result.ok({ restoredFilePath: "tasks/a.md" }),
  );
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  const restoreButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.getAttribute("aria-label") === "タスクA を復元");
  await act(async () => {
    restoreButton?.click();
  });

  expect(unarchiveTaskMock).toHaveBeenCalledWith({ filePath: "tasks/a.md" });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain(
      "アーカイブされたタスクはありません",
    );
  });
  expect(container?.textContent).toContain("タスクを復元しました");
});

test("復元失敗時は一覧を維持する", async () => {
  getArchivedTasksMock.mockResolvedValue(
    Result.ok({
      tasks: [{ filePath: "tasks/a.md", title: "タスクA", status: "Done" }],
    }),
  );
  unarchiveTaskMock.mockResolvedValue(Result.err(new Error("fail") as never));
  await renderTab();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("タスクA");
  });

  const restoreButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.getAttribute("aria-label") === "タスクA を復元");
  await act(async () => {
    restoreButton?.click();
  });

  expect(getArchivedTasksMock).toHaveBeenCalledTimes(1);
  expect(container?.textContent).toContain("タスクA");
});
