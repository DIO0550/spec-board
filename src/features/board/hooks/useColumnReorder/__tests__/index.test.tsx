import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { ColumnReorderHandler } from "@/features/board/components/BoardColumnProvider";
import {
  type UseColumnReorderOptions,
  useColumnReorder,
} from "@/features/board/hooks/useColumnReorder";
import {
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
} from "@/providers/ProjectProvider";
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
}: UseColumnReorderOptions & {
  onResult: (callback: ColumnReorderHandler) => void;
}) => {
  const callback = useColumnReorder(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};

test("reorderのoptimistic適用とrollbackをannounceする", async () => {
  let latest: ColumnReorderHandler | null = null;
  const announce = vi.fn();
  container = document.createElement("div");
  root = createRoot(container);
  const reorderColumns = vi.fn(async (_from, _to, callbacks) => {
    const event = { columnName: "Done", fromIndex: 1, toIndex: 0 };
    callbacks?.onOptimisticApplied?.(event);
    callbacks?.onRollback?.(event);
    return Result.ok({ applied: true });
  });
  act(() =>
    root?.render(
      createElement(Probe, {
        reorderColumns,
        announce,
        onError: vi.fn(),
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  await act(async () => {
    await (latest as unknown as ColumnReorderHandler)({
      fromColumnName: "Done",
      toColumnName: "Todo",
    });
  });
  expect(announce).toHaveBeenNthCalledWith(
    1,
    "「Done」を 1 番目に移動しました",
  );
  expect(announce).toHaveBeenNthCalledWith(2, "「Done」の移動を取り消しました");
});

test("reorderのproject switchは通知を抑止する", async () => {
  const onError = vi.fn();
  const announce = vi.fn();
  let latest: ColumnReorderHandler | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        reorderColumns: vi
          .fn()
          .mockResolvedValue(
            Result.err(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE)),
          ),
        announce,
        onError,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  await (latest as unknown as ColumnReorderHandler)({
    fromColumnName: "Done",
    toColumnName: "Todo",
  });
  expect(onError).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});

test("reorder失敗を操作文脈付きで通知する", async () => {
  const error = ProjectError.invalidState("失敗");
  const onError = vi.fn();
  let latest: ColumnReorderHandler | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        reorderColumns: vi.fn().mockResolvedValue(Result.err(error)),
        announce: vi.fn(),
        onError,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  await (latest as unknown as ColumnReorderHandler)({
    fromColumnName: "Done",
    toColumnName: "Todo",
  });
  expect(onError).toHaveBeenCalledWith(
    error,
    "カラムの並び替えに失敗しました: 失敗",
  );
});
