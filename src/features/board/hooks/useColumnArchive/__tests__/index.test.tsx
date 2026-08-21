import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  ColumnArchiveCallback,
  UseColumnArchiveOptions,
} from "@/features/board/hooks/useColumnArchive";
import { useColumnArchive } from "@/features/board/hooks/useColumnArchive";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * テスト用に最小限の Task を構築する。
 * @param patch - 上書きしたい一部フィールド
 * @returns Task
 */
const makeTask = (patch: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: patch.id ?? patch.filePath ?? "id",
    title: patch.title ?? "title",
    status: patch.status ?? "Done",
    labels: [],
    body: "",
    filePath: patch.filePath ?? "tasks/x.md",
    links: [],
    reverseLinks: [],
    children: patch.children ?? [],
    parent: patch.parent,
  });

/**
 * useColumnArchive を mount して callback を取り出す。
 * @param options - フックへ渡す options
 * @returns callback getter
 */
const mountHook = (options: UseColumnArchiveOptions) => {
  let latest: ColumnArchiveCallback | null = null;
  const Probe = () => {
    latest = useColumnArchive(options);
    return null;
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Probe));
  });
  return {
    get callback(): ColumnArchiveCallback {
      return latest as ColumnArchiveCallback;
    },
  };
};

test("対象カラムのタスクを子から順にアーカイブする", async () => {
  const archived: string[] = [];
  const archiveTask = vi.fn(async (params: { filePath: string }) => {
    archived.push(params.filePath);
    return Result.ok(undefined);
  });
  const tasks = [
    makeTask({ filePath: "tasks/parent.md" }),
    makeTask({ filePath: "tasks/child.md", parent: "tasks/parent.md" }),
    makeTask({
      filePath: "tasks/grandchild.md",
      parent: "tasks/child.md",
    }),
  ];
  const probe = mountHook({
    tasks,
    archiveTask: archiveTask as never,
    showToast: vi.fn(),
  });

  await act(async () => {
    await probe.callback("Done");
  });

  expect(archived).toEqual([
    "tasks/grandchild.md",
    "tasks/child.md",
    "tasks/parent.md",
  ]);
});

test("他カラムのタスクはアーカイブ対象にしない", async () => {
  const archiveTask = vi.fn(async () => Result.ok(undefined));
  const tasks = [
    makeTask({ filePath: "tasks/done.md", status: "Done" }),
    makeTask({ filePath: "tasks/todo.md", status: "Todo" }),
  ];
  const probe = mountHook({
    tasks,
    archiveTask: archiveTask as never,
    showToast: vi.fn(),
  });

  await act(async () => {
    await probe.callback("Done");
  });

  expect(archiveTask).toHaveBeenCalledTimes(1);
  expect(archiveTask).toHaveBeenCalledWith({ filePath: "tasks/done.md" });
});

test("全件成功で成功トーストを 1 回出す", async () => {
  const showToast = vi.fn();
  const archiveTask = vi.fn(async () => Result.ok(undefined));
  const probe = mountHook({
    tasks: [
      makeTask({ filePath: "tasks/a.md" }),
      makeTask({ filePath: "tasks/b.md" }),
    ],
    archiveTask: archiveTask as never,
    showToast,
  });

  await act(async () => {
    await probe.callback("Done");
  });

  expect(showToast).toHaveBeenCalledWith(
    "2 件のタスクをアーカイブしました",
    "success",
  );
});

test("一部失敗は失敗件数付きの warning トーストになる", async () => {
  const showToast = vi.fn();
  const results = [
    Result.ok(undefined),
    Result.err({ type: "invalid-state" as const, message: "x" }),
  ];
  let call = 0;
  const archiveTask = vi.fn(async () => {
    const result = results[call] ?? Result.ok(undefined);
    call += 1;
    return result;
  });
  const probe = mountHook({
    tasks: [
      makeTask({ filePath: "tasks/a.md" }),
      makeTask({ filePath: "tasks/b.md" }),
    ],
    archiveTask: archiveTask as never,
    showToast,
  });

  await act(async () => {
    await probe.callback("Done");
  });

  expect(showToast).toHaveBeenCalledWith(
    "1 件をアーカイブしました（1 件は失敗）",
    "warning",
  );
});

test("対象 0 件では IPC を呼ばず warning トーストを出す", async () => {
  const showToast = vi.fn();
  const archiveTask = vi.fn(async () => Result.ok(undefined));
  const probe = mountHook({
    tasks: [makeTask({ filePath: "tasks/todo.md", status: "Todo" })],
    archiveTask: archiveTask as never,
    showToast,
  });

  await act(async () => {
    await probe.callback("Done");
  });

  expect(archiveTask).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "アーカイブ対象のタスクがありません",
    "warning",
  );
});
