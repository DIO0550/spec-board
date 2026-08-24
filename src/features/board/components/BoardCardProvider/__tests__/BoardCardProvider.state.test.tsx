import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { TaskProjection } from "@/domains/task-projection";
import {
  type BoardCardApi,
  BoardCardProvider,
  type BoardCardProviderProps,
  type TaskDrop,
  useBoardCard,
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
 * useBoardCard の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (api: BoardCardApi) => void }) => {
  const api = useBoardCard();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * BoardCardProvider 配下に Probe を mount し、latest API を観測する。
 * @param overrides 上書きしたい Provider props（children 以外）
 * @returns latest accessor
 */
const mountProbe = (
  overrides: Partial<Omit<BoardCardProviderProps, "children">> = {},
) => {
  let latest: BoardCardApi | null = null;
  const handleResult = (api: BoardCardApi) => {
    latest = api;
  };
  const tree: ReactNode = (
    <StrictMode>
      <BoardCardProvider
        tasks={[]}
        allTasks={[]}
        projections={TaskProjection.emptyMap}
        {...overrides}
      >
        <Probe onResult={handleResult} />
      </BoardCardProvider>
    </StrictMode>
  );
  act(() => {
    root?.render(tree);
  });
  return {
    get latest(): BoardCardApi {
      return latest as BoardCardApi;
    },
  };
};

test("idle 状態では isDragging が常に false を返す", () => {
  const probe = mountProbe();
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
  expect(probe.latest.hoverTarget).toEqual({ column: null, index: null });
});

test("startDrag を呼ぶと isDragging(filePath) が true になる", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
  });
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(true);
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/b.md"))).toBe(
    false,
  );
});

test("startDrag 後の hover で hoverTarget が更新される", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
  });
  act(() => {
    probe.latest.hover("In Progress", 2);
  });
  expect(probe.latest.hoverTarget).toEqual({
    column: "In Progress",
    index: 2,
  });
});

test("idle 状態での hover は state を変えない（no-op）", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.hover("In Progress", 2);
  });
  expect(probe.latest.hoverTarget).toEqual({ column: null, index: null });
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
});

test("end を呼ぶと isDragging が false に戻り hoverTarget も idle に戻る", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
    probe.latest.hover("In Progress", 2);
  });
  act(() => {
    probe.latest.end();
  });
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
  expect(probe.latest.hoverTarget).toEqual({ column: null, index: null });
});

test("dropTask は onTaskDrop を呼び、その後 end() が走って idle に戻る", async () => {
  const onTaskDrop = vi.fn();
  const params: TaskDrop = {
    taskFilePath: taskFilePathFixture("tasks/a.md"),
    fromColumn: "Todo",
    toColumn: "In Progress",
    toIndex: 0,
  };
  const probe = mountProbe({ onTaskDrop });
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
  });
  await act(async () => {
    await probe.latest.dropTask(params);
  });
  expect(onTaskDrop).toHaveBeenCalledWith(params);
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
});

test("dropTask は onTaskDrop が reject / throw しても外には伝搬せず、finally で end() が走る", async () => {
  const onTaskDrop = vi.fn().mockRejectedValue(new Error("boom"));
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const params: TaskDrop = {
    taskFilePath: taskFilePathFixture("tasks/a.md"),
    fromColumn: "Todo",
    toColumn: "In Progress",
    toIndex: 0,
  };
  const probe = mountProbe({ onTaskDrop });
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
  });
  await act(async () => {
    await expect(probe.latest.dropTask(params)).resolves.toBeUndefined();
  });
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});

test("dropTask は onTaskDrop が未指定でも reject せず end() が走る", async () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.startDrag(taskFilePathFixture("tasks/a.md"), "Todo");
  });
  await act(async () => {
    await probe.latest.dropTask({
      taskFilePath: taskFilePathFixture("tasks/a.md"),
      fromColumn: "Todo",
      toColumn: "Done",
      toIndex: 0,
    });
  });
  expect(probe.latest.isDragging(taskFilePathFixture("tasks/a.md"))).toBe(
    false,
  );
});

test("Provider の外で useBoardCard を呼ぶと throw する", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(<Probe onResult={() => {}} />);
    });
  }).toThrow(/BoardCardProvider/);
  consoleSpy.mockRestore();
});
