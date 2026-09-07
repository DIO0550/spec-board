import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import {
  type TaskDeleteCallback,
  type UseTaskDeleteOptions,
  useTaskDelete,
} from "@/features/detail/hooks/useTaskDelete";
import type { OrphanStrategy } from "@/lib/tauri";
import {
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
} from "@/providers/ProjectProvider";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

const globalWithAct = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const previousActEnvironment = globalWithAct.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  globalWithAct.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  globalWithAct.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const task = Task.fromPayload({
  id: "task-1",
  title: "削除対象",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/task-1.md",
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const Probe = ({
  onResult,
  ...hookOptions
}: UseTaskDeleteOptions & {
  onResult: (callback: TaskDeleteCallback) => void;
}) => {
  const callback = useTaskDelete(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};

const renderHook = (hookOptions: UseTaskDeleteOptions) => {
  let latest: TaskDeleteCallback | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        ...hookOptions,
        onResult: (callback) => {
          latest = callback;
        },
      }),
    );
  });
  return () => latest as TaskDeleteCallback;
};

const createOptions = (
  overrides: Partial<UseTaskDeleteOptions> = {},
): UseTaskDeleteOptions => ({
  tasks: [task],
  deleteTask: vi.fn().mockResolvedValue(Result.ok(undefined)),
  showToast: vi.fn(),
  announce: vi.fn(),
  onError: vi.fn(),
  onPendingTaskChange: vi.fn(),
  onDeleted: vi.fn(),
  ...overrides,
});

test("削除成功時はsnapshotを保持してから選択解除・通知する", async () => {
  const deleteTask = vi.fn().mockResolvedValue(Result.ok(undefined));
  const onPendingTaskChange = vi.fn();
  const onDeleted = vi.fn();
  const showToast = vi.fn();
  const announce = vi.fn();
  const get = renderHook(
    createOptions({
      deleteTask,
      onPendingTaskChange,
      onDeleted,
      showToast,
      announce,
    }),
  );

  await act(async () => get()(task.id, "clear"));

  expect(deleteTask).toHaveBeenCalledWith({
    filePath: task.filePath,
    orphanStrategy: "clear",
  });
  expect(onPendingTaskChange).toHaveBeenNthCalledWith(1, task);
  expect(onPendingTaskChange).toHaveBeenNthCalledWith(2, null);
  expect(onDeleted).toHaveBeenCalledOnce();
  expect(showToast).toHaveBeenCalledWith("タスクを削除しました", "success");
  expect(announce).toHaveBeenCalledWith("「削除対象」を削除しました");
});

test("通常の削除失敗時はsnapshotを解放し、通知して再throwする", async () => {
  const error = ProjectError.invalidState("削除できません");
  const onPendingTaskChange = vi.fn();
  const onError = vi.fn();
  const announce = vi.fn();
  const get = renderHook(
    createOptions({
      deleteTask: vi.fn().mockResolvedValue(Result.err(error)),
      onPendingTaskChange,
      onError,
      announce,
    }),
  );

  await expect(act(async () => get()(task.id))).rejects.toThrow(
    "削除できません",
  );

  expect(onPendingTaskChange).toHaveBeenLastCalledWith(null);
  expect(onError).toHaveBeenCalledWith(
    error,
    "タスクの削除に失敗しました: 削除できません",
  );
  expect(announce).toHaveBeenCalledWith("「削除対象」の削除を取り消しました");
});

test("project切替による失敗は表示通知を抑止して再throwする", async () => {
  const error = ProjectError.projectSwitched();
  const onError = vi.fn();
  const announce = vi.fn();
  const get = renderHook(
    createOptions({
      deleteTask: vi.fn().mockResolvedValue(Result.err(error)),
      onError,
      announce,
    }),
  );

  await expect(act(async () => get()(task.id))).rejects.toThrow(
    PROJECT_SWITCHED_MESSAGE,
  );
  expect(onError).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});

test("対象taskが存在しない場合は削除actionを呼ばない", async () => {
  const deleteTask = vi.fn();
  const get = renderHook(createOptions({ tasks: [], deleteTask }));

  await act(async () =>
    get()("missing", undefined as OrphanStrategy | undefined),
  );

  expect(deleteTask).not.toHaveBeenCalled();
});
