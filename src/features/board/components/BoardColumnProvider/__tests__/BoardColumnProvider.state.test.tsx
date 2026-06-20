import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Column } from "@/types/column";
import {
  type BoardColumnApi,
  BoardColumnProvider,
  type BoardColumnProviderProps,
  type ColumnReorder,
  useBoardColumn,
} from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * useBoardColumn の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (api: BoardColumnApi) => void }) => {
  const api = useBoardColumn();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * BoardColumnProvider 配下に Probe を mount し、latest API を観測する。
 * @param overrides 上書きしたい Provider props（children 以外）
 * @returns latest accessor
 */
const mountProbe = (
  overrides: Partial<Omit<BoardColumnProviderProps, "children">> = {},
) => {
  let latest: BoardColumnApi | null = null;
  const handleResult = (api: BoardColumnApi) => {
    latest = api;
  };
  const tree: ReactNode = (
    <StrictMode>
      <BoardColumnProvider
        columns={overrides.columns ?? []}
        tasks={overrides.tasks ?? []}
        allTasks={overrides.allTasks}
        dndDisabled={overrides.dndDisabled}
        onColumnReorder={overrides.onColumnReorder}
      >
        <Probe onResult={handleResult} />
      </BoardColumnProvider>
    </StrictMode>
  );
  act(() => {
    root?.render(tree);
  });
  return {
    get latest(): BoardColumnApi {
      return latest as BoardColumnApi;
    },
  };
};

const COLUMNS: readonly Column[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
];

test("idle 状態では isDragging が常に false / hoverIndex は null", () => {
  const probe = mountProbe({ columns: COLUMNS });
  expect(probe.latest.isDragging("Todo")).toBe(false);
  expect(probe.latest.hoverIndex).toBeNull();
});

test("startDrag を呼ぶと isDragging(columnName) が true になる", () => {
  const probe = mountProbe({ columns: COLUMNS });
  act(() => {
    probe.latest.startDrag("Todo");
  });
  expect(probe.latest.isDragging("Todo")).toBe(true);
  expect(probe.latest.isDragging("In Progress")).toBe(false);
});

test("startDrag 後の hover で hoverIndex が更新される", () => {
  const probe = mountProbe({ columns: COLUMNS });
  act(() => {
    probe.latest.startDrag("Todo");
  });
  act(() => {
    probe.latest.hover(1);
  });
  expect(probe.latest.hoverIndex).toBe(1);
});

test("end を呼ぶと isDragging が false に戻り hoverIndex も null に戻る", () => {
  const probe = mountProbe({ columns: COLUMNS });
  act(() => {
    probe.latest.startDrag("Todo");
    probe.latest.hover(2);
  });
  act(() => {
    probe.latest.end();
  });
  expect(probe.latest.isDragging("Todo")).toBe(false);
  expect(probe.latest.hoverIndex).toBeNull();
});

test("dropColumn は onColumnReorder が throw しても reject せず finally で end() が走る", async () => {
  const onColumnReorder = vi.fn().mockRejectedValue(new Error("boom"));
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const params: ColumnReorder = {
    fromColumnName: "Todo",
    toColumnName: "In Progress",
  };
  const probe = mountProbe({ columns: COLUMNS, onColumnReorder });
  act(() => {
    probe.latest.startDrag("Todo");
  });
  await act(async () => {
    await expect(probe.latest.dropColumn(params)).resolves.toBeUndefined();
  });
  expect(probe.latest.isDragging("Todo")).toBe(false);
  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});

test("Provider の外で useBoardColumn を呼ぶと throw する", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(<Probe onResult={() => {}} />);
    });
  }).toThrow(/BoardColumnProvider/);
  consoleSpy.mockRestore();
});
