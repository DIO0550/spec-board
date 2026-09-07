import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { TaskDropHandler } from "@/features/board/components/BoardCardProvider";
import {
  type UseTaskMoveOptions,
  useTaskMove,
} from "@/features/board/hooks/useTaskMove";
import { ProjectError } from "@/providers/ProjectProvider";
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
  title: "移動対象",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/task-1.md",
});
const params = {
  taskFilePath: task.filePath,
  fromColumn: "Todo",
  toColumn: "Done",
  toIndex: 0,
};

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
}: UseTaskMoveOptions & {
  onResult: (callback: TaskDropHandler) => void;
}) => {
  const callback = useTaskMove(options);
  useEffect(() => onResult(callback));
  return null;
};

const renderHook = (options: UseTaskMoveOptions) => {
  let latest: TaskDropHandler | null = null;
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
  return () => latest as TaskDropHandler;
};

test("カラム間移動のoptimistic適用とrollbackをannounceする", async () => {
  const announce = vi.fn();
  const moveTask = vi.fn(async (_params, callbacks) => {
    callbacks?.onOptimisticApplied?.(params);
    callbacks?.onRollback?.(params);
    return Result.ok(undefined);
  });
  const get = renderHook({
    tasks: [task],
    moveTask,
    announce,
    onError: vi.fn(),
  });

  await act(async () => get()(params));

  expect(announce).toHaveBeenNthCalledWith(
    1,
    "「移動対象」を「Done」に移動しました",
  );
  expect(announce).toHaveBeenNthCalledWith(
    2,
    "「移動対象」の移動を取り消しました",
  );
});

test("同一カラム移動ではoptimistic announceを出さない", async () => {
  const announce = vi.fn();
  const sameColumn = { ...params, toColumn: params.fromColumn };
  const moveTask = vi.fn(async (_params, callbacks) => {
    callbacks?.onOptimisticApplied?.(sameColumn);
    return Result.ok(undefined);
  });
  const get = renderHook({
    tasks: [task],
    moveTask,
    announce,
    onError: vi.fn(),
  });

  await act(async () => get()(sameColumn));

  expect(announce).not.toHaveBeenCalled();
});

test("移動失敗時は操作文脈付きでonErrorを呼ぶ", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  const get = renderHook({
    tasks: [task],
    moveTask: vi.fn().mockResolvedValue(Result.err(error)),
    announce: vi.fn(),
    onError,
  });

  await act(async () => get()(params));

  expect(onError).toHaveBeenCalledWith(
    error,
    "タスクの移動に失敗しました: 失敗",
  );
});
