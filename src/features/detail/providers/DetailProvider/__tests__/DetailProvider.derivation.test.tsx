import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskPathLookup } from "@/domains/task-path-lookup";
import { TaskProjection } from "@/domains/task-projection";
import { Task, type TaskPayload } from "@/types/task";
import {
  type DetailApi,
  DetailProvider,
  type DetailProviderProps,
  useDetail,
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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

/**
 * useDetail の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (api: DetailApi) => void }) => {
  const api = useDetail();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * DetailProvider 配下に Probe を mount し、latest API を観測する。
 * @param overrides 上書きしたい Provider props（children 以外）
 * @returns latest accessor と再 render 関数
 */
const mountProbe = (
  overrides: Partial<Omit<DetailProviderProps, "children">> = {},
) => {
  let latest: DetailApi | null = null;
  const handleResult = (api: DetailApi) => {
    latest = api;
  };
  const build = (): ReactNode => (
    <StrictMode>
      <DetailProvider
        task={createTask()}
        columns={[]}
        projections={TaskProjection.emptyMap}
        onTaskUpdate={() => {}}
        {...overrides}
      >
        <Probe onResult={handleResult} />
      </DetailProvider>
    </StrictMode>
  );
  act(() => {
    root?.render(build());
  });
  return {
    get latest(): DetailApi {
      return latest as DetailApi;
    },
    rerender: () => {
      act(() => {
        root?.render(build());
      });
    },
  };
};

test("task / columns / allTasks を参照そのままで配信する", () => {
  const task = createTask();
  const columns = [{ name: "Todo", order: 0 }];
  const allTasks = [task];
  const probe = mountProbe({ task, columns, allTasks });
  expect(probe.latest.task).toBe(task);
  expect(probe.latest.columns).toBe(columns);
  expect(probe.latest.allTasks).toBe(allTasks);
});

test("labelSuggestions 未指定なら空配列が配信される", () => {
  const probe = mountProbe();
  expect(probe.latest.labelSuggestions).toEqual([]);
});

test("allTasks に親がいれば parentTask として解決される", () => {
  const parent = createTask({ id: "p", filePath: "tasks/p.md" });
  const child = createTask({
    id: "c",
    filePath: "tasks/c.md",
    parent: "tasks/p.md",
  });
  const probe = mountProbe({ task: child, allTasks: [parent, child] });
  expect(probe.latest.parentTask).toBe(parent);
});

test("allTasks 未指定なら parentTask は null で allTasks は undefined のまま", () => {
  const child = createTask({ parent: "tasks/p.md" });
  const probe = mountProbe({ task: child });
  expect(probe.latest.parentTask).toBeNull();
  expect(probe.latest.allTasks).toBeUndefined();
});

test("tasksByNormalizedPath に無い parent は brokenLinks.parent が true になる", () => {
  const child = createTask({ parent: "tasks/missing.md" });
  const probe = mountProbe({
    task: child,
    tasksByNormalizedPath: TaskPathLookup.fromTasks([child]),
  });
  expect(probe.latest.brokenLinks.parent).toBe(true);
});

test("tasksByNormalizedPath 未指定なら brokenLinks は全て非 broken", () => {
  const child = createTask({
    parent: "tasks/missing.md",
    links: ["tasks/x.md"],
  });
  const probe = mountProbe({ task: child });
  expect(probe.latest.brokenLinks.parent).toBe(false);
  expect(probe.latest.brokenLinks.links.size).toBe(0);
});

test("handlers.onStatusChange が onTaskUpdate(task.id, { status }) を呼ぶ", () => {
  const onTaskUpdate = vi.fn();
  const probe = mountProbe({ onTaskUpdate });
  act(() => {
    probe.latest.handlers.onStatusChange("Done");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("task-1", { status: "Done" });
});

test("同じ props で再レンダーしても api の参照が変わらない", () => {
  const task = createTask();
  const columns = [{ name: "Todo", order: 0 }];
  const onTaskUpdate = vi.fn();
  const probe = mountProbe({ task, columns, onTaskUpdate });
  const first = probe.latest;
  probe.rerender();
  expect(probe.latest).toBe(first);
});

test("Provider の外で useDetail を呼ぶと throw する", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(<Probe onResult={() => {}} />);
    });
  }).toThrow(/DetailProvider/);
  consoleSpy.mockRestore();
});
