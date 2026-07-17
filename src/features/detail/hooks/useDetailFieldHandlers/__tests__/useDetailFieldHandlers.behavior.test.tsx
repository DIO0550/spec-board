import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import {
  type DetailFieldHandlers,
  useDetailFieldHandlers,
} from "@/features/detail/hooks/useDetailFieldHandlers";

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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function createTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "本文",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

/**
 * useDetailFieldHandlers の戻り値を公開するテスト用 Probe。
 * @param props - task / onTaskUpdate / onResult
 * @returns null
 */
const Probe = ({
  task,
  onTaskUpdate,
  onResult,
}: {
  task: Task;
  onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void;
  onResult: (result: DetailFieldHandlers) => void;
}) => {
  const handlers = useDetailFieldHandlers(task, onTaskUpdate);
  useEffect(() => {
    onResult(handlers);
  });
  return null;
};

/**
 * Probe をレンダリングし、最新の handlers を取得する。
 * @param task - 対象タスク
 * @param onTaskUpdate - 更新コールバック
 * @returns 最新 handlers を返す getter
 */
const renderHook = (
  task: Task,
  onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void,
): (() => DetailFieldHandlers) => {
  let latest: DetailFieldHandlers | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        task,
        onTaskUpdate,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return () => latest as unknown as DetailFieldHandlers;
};

test("onStatusChange で onTaskUpdate(task.id, { status }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const get = renderHook(createTask({ id: "t-1" }), onTaskUpdate);
  act(() => {
    get().onStatusChange("Done");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-1", { status: "Done" });
});

test("onPriorityChange で onTaskUpdate(task.id, { priority }) が呼ばれる", () => {
  const onTaskUpdate = vi.fn();
  const get = renderHook(createTask({ id: "t-2" }), onTaskUpdate);
  act(() => {
    get().onPriorityChange("High");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-2", { priority: "High" });
});

test("onLabelsChange で受け取った配列がそのまま onTaskUpdate に反映される", () => {
  const onTaskUpdate = vi.fn();
  const get = renderHook(createTask({ id: "t-3", labels: [] }), onTaskUpdate);
  act(() => {
    get().onLabelsChange(["bug"]);
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-3", { labels: ["bug"] });
});

test("onLabelsChange で除外後の配列を渡すと onTaskUpdate に反映される", () => {
  const onTaskUpdate = vi.fn();
  const get = renderHook(
    createTask({ id: "t-4", labels: ["bug", "feat"] }),
    onTaskUpdate,
  );
  act(() => {
    get().onLabelsChange(["feat"]);
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t-4", { labels: ["feat"] });
});
