import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ProjectData } from "@/domains/project-data";
import {
  type ColumnDeleteCallback,
  type UseColumnDeleteOptions,
  useColumnDelete,
} from "@/features/board/hooks/useColumnDelete";
import { ProjectError } from "@/providers/ProjectProvider";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});
const Probe = ({
  onResult,
  ...hookOptions
}: UseColumnDeleteOptions & {
  onResult: (callback: ColumnDeleteCallback) => void;
}) => {
  const callback = useColumnDelete(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};
const renderHook = (
  hookOptions: UseColumnDeleteOptions,
): ColumnDeleteCallback => {
  let latest: ColumnDeleteCallback | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        ...hookOptions,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  return (...args) => (latest as ColumnDeleteCallback)(...args);
};

test("doneColumn削除時に残存最大orderへfallbackする", async () => {
  let builder: ((current: ProjectData) => unknown) | null = null;
  const columns = [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
    { name: "Review", order: 3 },
  ];
  const callback = renderHook({
    columns,
    tasks: [],
    updateColumns: vi.fn(async (input) => {
      builder = input as typeof builder;
      return Result.ok({ applied: true });
    }),
    showToast: vi.fn(),
    onError: vi.fn(),
  });
  await act(async () => callback("Done", undefined));
  expect(
    (builder as unknown as (current: ProjectData) => unknown)({
      columns,
      tasks: [],
      doneColumn: "Done",
    } as unknown as ProjectData),
  ).toEqual({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Review", order: 3 },
    ],
    renames: undefined,
    doneColumn: "Review",
  });
});

test("最後のcolumnは削除しない", async () => {
  const updateColumns = vi.fn();
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [{ name: "Todo", order: 0 }],
    tasks: [],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });
  await callback("Todo", undefined);
  expect(updateColumns).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "最後のカラムは削除できません",
    "error",
  );
});

test("task残存時は移動先を必須にする", async () => {
  const task = Task.fromPayload({
    id: "task",
    title: "Task",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "task.md",
  });
  const updateColumns = vi.fn();
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
    tasks: [task],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });
  await callback("Todo", undefined);
  expect(updateColumns).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "タスクが残っているため移動先カラムが必要です",
    "error",
  );
});

test("column delete errorを通知してrejectする", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  const callback = renderHook({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
    tasks: [],
    updateColumns: vi.fn().mockResolvedValue(Result.err(error)),
    showToast: vi.fn(),
    onError,
  });
  await expect(callback("Todo", undefined)).rejects.toThrow("失敗");
  expect(onError).toHaveBeenCalledWith(
    error,
    "カラムの削除に失敗しました: 失敗",
  );
});
