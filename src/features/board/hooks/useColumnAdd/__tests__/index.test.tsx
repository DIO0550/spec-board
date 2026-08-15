import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ProjectData } from "@/domains/project-data";
import {
  type ColumnAddCallback,
  type UseColumnAddOptions,
  useColumnAdd,
} from "@/features/board/hooks/useColumnAdd";
import { ProjectError } from "@/providers/ProjectProvider";
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
}: UseColumnAddOptions & {
  onResult: (callback: ColumnAddCallback) => void;
}) => {
  const callback = useColumnAdd(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};

const renderHook = (hookOptions: UseColumnAddOptions): ColumnAddCallback => {
  let latest: ColumnAddCallback | null = null;
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
  return (...args) => (latest as ColumnAddCallback)(...args);
};

test("column add成功で末尾orderと既存doneColumnを引き継ぐ", async () => {
  let builder: ((current: ProjectData) => unknown) | null = null;
  const updateColumns = vi.fn(async (input) => {
    builder = input as typeof builder;
    return Result.ok({ applied: true });
  });
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 2 },
    ],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });

  await act(async () => callback(" Review "));

  expect(
    (builder as unknown as (current: ProjectData) => unknown)({
      columns: [
        { name: "Todo", order: 0 },
        { name: "Done", order: 2 },
      ],
      doneColumn: "Done",
    } as unknown as ProjectData),
  ).toEqual({
    columns: [
      { name: "Todo", order: 0 },
      { name: "Done", order: 2 },
      { name: "Review", order: 3 },
    ],
    doneColumn: "Done",
  });
  expect(showToast).toHaveBeenCalledWith("カラムを追加しました", "success");
});

test("最大order到達時は重複orderを作らず追加を適用しない", async () => {
  const maxOrder = 2 ** 32 - 1;
  let builder: ((current: ProjectData) => unknown) | null = null;
  const updateColumns = vi.fn(async (input) => {
    builder = input as typeof builder;
    return Result.ok({ applied: false });
  });

  const showToast = vi.fn();
  const callback = renderHook({
    columns: [{ name: "Limit", order: maxOrder }],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });

  await expect(callback("Review")).rejects.toThrow(
    "カラムの追加が適用されませんでした",
  );
  expect(
    (builder as unknown as (current: ProjectData) => unknown)({
      columns: [{ name: "Limit", order: maxOrder }],
    } as unknown as ProjectData),
  ).toBeNull();
  expect(showToast).toHaveBeenCalledWith(
    "カラムの追加が適用されませんでした (他の操作と競合した可能性)",
    "error",
  );
});

test("重複columnは即時拒否する", async () => {
  const updateColumns = vi.fn();
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [{ name: "Review", order: 0 }],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });
  await callback("Review");
  expect(updateColumns).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "同じ名前のカラムが既に存在します",
    "error",
  );
});

test("queue競合で適用されなかったaddをrejectする", async () => {
  const onError = vi.fn();
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [],
    updateColumns: vi.fn().mockResolvedValue(Result.ok({ applied: false })),
    showToast,
    onError,
  });
  await expect(callback("Review")).rejects.toThrow(
    "カラムの追加が適用されませんでした",
  );
  expect(onError).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "カラムの追加が適用されませんでした (他の操作と競合した可能性)",
    "error",
  );
});

test("column add errorを通知してrejectする", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  const callback = renderHook({
    columns: [],
    updateColumns: vi.fn().mockResolvedValue(Result.err(error)),
    showToast: vi.fn(),
    onError,
  });
  await expect(callback("Review")).rejects.toThrow("失敗");
  expect(onError).toHaveBeenCalledWith(
    error,
    "カラムの追加に失敗しました: 失敗",
  );
});

test("空白だけのcolumn addはIPCを呼ばず入力エラーにする", async () => {
  const updateColumns = vi.fn();
  const showToast = vi.fn();
  const callback = renderHook({
    columns: [],
    updateColumns,
    showToast,
    onError: vi.fn(),
  });

  await expect(callback("   ")).rejects.toThrow("カラム名を入力してください");
  expect(updateColumns).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith("カラム名を入力してください", "error");
});
