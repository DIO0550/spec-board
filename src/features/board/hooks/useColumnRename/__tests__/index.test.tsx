import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ProjectData } from "@/domains/project-data";
import { ProjectError } from "@/providers/ProjectProvider";
import { Result } from "@/utils/result";
import {
  type ColumnRenameCallback,
  type UseColumnRenameOptions,
  useColumnRename,
} from "@/features/board/hooks/useColumnRename";

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
}: UseColumnRenameOptions & {
  onResult: (callback: ColumnRenameCallback) => void;
}) => {
  const callback = useColumnRename(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};
const renderHook = (
  hookOptions: UseColumnRenameOptions,
): ColumnRenameCallback => {
  let latest: ColumnRenameCallback | null = null;
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
  return (...args) => (latest as ColumnRenameCallback)(...args);
};

test("doneColumnをrenameに追従させる", async () => {
  let builder: ((current: ProjectData) => unknown) | null = null;
  const callback = renderHook({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
    updateColumns: vi.fn(async (input) => {
      builder = input as typeof builder;
      return Result.ok({ applied: true });
    }),
    showToast: vi.fn(),
    onError: vi.fn(),
  });
  await act(async () => callback("Done", "Closed"));
  expect(
    (builder as unknown as (current: ProjectData) => unknown)({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 1 },
      ],
      doneColumn: "Done",
    } as unknown as ProjectData),
  ).toEqual({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Closed", order: 1 },
    ],
    renames: [{ from: "Done", to: "Closed" }],
    doneColumn: "Closed",
  });
});

test("重複名へのrenameは即時拒否する", async () => {
  const updateColumns = vi.fn();
  const showToast = vi.fn();
  const duplicate = renderHook({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 1 },
    ],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });
  await duplicate("Todo", "Done");
  expect(updateColumns).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "同じ名前のカラムが既に存在します",
    "error",
  );
});

test("適用されなかったrenameをrejectする", async () => {
  const callback = renderHook({
    columns: [{ name: "Todo", order: 0 }],
    updateColumns: vi.fn().mockResolvedValue(Result.ok({ applied: false })),
    showToast: vi.fn(),
    onError: vi.fn(),
  });
  await expect(callback("Todo", "Doing")).rejects.toThrow(
    "カラム名の変更が適用されませんでした",
  );
});

test("column rename errorを通知してrejectする", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  const callback = renderHook({
    columns: [{ name: "Todo", order: 0 }],
    updateColumns: vi.fn().mockResolvedValue(Result.err(error)),
    showToast: vi.fn(),
    onError,
  });
  await expect(callback("Todo", "Doing")).rejects.toThrow("失敗");
  expect(onError).toHaveBeenCalledWith(
    error,
    "カラム名の変更に失敗しました: 失敗",
  );
});
