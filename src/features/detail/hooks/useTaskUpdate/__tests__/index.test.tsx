import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  taskFilePathFixture,
  taskIdFixture,
} from "@/domains/__tests__/taskFixtures";
import type { TaskUpdateHandler } from "@/features/detail/hooks/useDetailFieldHandlers";
import {
  type UseTaskUpdateOptions,
  useTaskUpdate,
} from "@/features/detail/hooks/useTaskUpdate";
import { ProjectError } from "@/providers/ProjectProvider";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

const task = Task.fromPayload({
  id: "task-1",
  title: "更新前",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/task-1.md"),
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
  ...options
}: UseTaskUpdateOptions & {
  onResult: (callback: TaskUpdateHandler) => void;
}) => {
  const callback = useTaskUpdate(options);
  useEffect(() => onResult(callback));
  return null;
};

const renderHook = (options: UseTaskUpdateOptions) => {
  let latest: TaskUpdateHandler | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        ...options,
        onResult: (callback) => {
          latest = callback;
        },
      }),
    );
  });
  return () => latest as TaskUpdateHandler;
};

test("更新成功時はfilePathを後置した引数でactionを呼び成功toastを出す", async () => {
  const updateTask = vi.fn().mockResolvedValue(Result.ok(task));
  const showToast = vi.fn();
  const onError = vi.fn();
  const get = renderHook({ tasks: [task], updateTask, showToast, onError });

  await act(async () =>
    get()(task.id, {
      title: "更新後",
      filePath: taskFilePathFixture("不正"),
    }),
  );

  expect(updateTask).toHaveBeenCalledWith({
    title: "更新後",
    filePath: task.filePath,
  });
  expect(showToast).toHaveBeenCalledWith("タスクを更新しました", "success");
  expect(onError).not.toHaveBeenCalled();
});

test("対象taskが存在しない場合はactionを呼ばない", async () => {
  const updateTask = vi.fn();
  const get = renderHook({
    tasks: [],
    updateTask,
    showToast: vi.fn(),
    onError: vi.fn(),
  });

  await act(async () => get()(taskIdFixture("missing"), { title: "更新" }));

  expect(updateTask).not.toHaveBeenCalled();
});

test("更新失敗時は操作文脈付きでonErrorを呼ぶ", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  const get = renderHook({
    tasks: [task],
    updateTask: vi.fn().mockResolvedValue(Result.err(error)),
    showToast: vi.fn(),
    onError,
  });

  await act(async () => get()(task.id, { title: "更新" }));

  expect(onError).toHaveBeenCalledWith(
    error,
    "タスクの更新に失敗しました: 失敗",
  );
});
