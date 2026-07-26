import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import {
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import {
  type UseChildTasksArgs,
  type UseChildTasksResult,
  useChildTasks,
} from "..";

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

const fp = (id: string) => `tasks/${id}.md`;

const projection = (
  done: number,
  total: number,
  childFilePaths: readonly string[] = [],
  isDone = false,
): TaskProjection => ({
  subIssueProgress: { done, total },
  isDone,
  childFilePaths,
});

/**
 * useChildTasks の戻り値を観測する Probe。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseChildTasksArgs & {
    onResult: (r: UseChildTasksResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useChildTasks(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、props 更新で再レンダーしながら最新値を取得する。
 * @param args - useChildTasks の初期引数
 * @returns latest と rerender
 */
const renderHook = (args: UseChildTasksArgs) => {
  let latest: UseChildTasksResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseChildTasksResult) => {
    latest = r;
  };
  act(() => {
    root?.render(createElement(Probe, { ...args, onResult: handleResult }));
  });
  return {
    get latest(): UseChildTasksResult {
      return latest as UseChildTasksResult;
    },
    rerender(nextArgs: UseChildTasksArgs) {
      act(() => {
        root?.render(
          createElement(Probe, { ...nextArgs, onResult: handleResult }),
        );
      });
    },
  };
};

test("childTasks は projection の childFilePaths を allTasks で解決して返す", () => {
  const child = makeTask({ id: "c1", parent: fp("root") });
  const grand = makeTask({ id: "g1", parent: fp("c1") });
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask, child, grand],
    projections: new Map([[fp("root"), projection(0, 2, [fp("c1")])]]),
  });

  expect(probe.latest.childTasks.map((t) => t.id)).toEqual(["c1"]);
});

/**
 * 並びは BE の `file_path` 昇順をそのまま維持する。画面の行順は
 * `SubIssueSection.buildChildRowList` が `parentTask.hierarchy.childFilePaths`
 * から決めるため、この並び順の契約は表示に影響しない。
 */
test("childTasks は projection の並び順（file_path 昇順）を維持する", () => {
  const c1 = makeTask({ id: "c1", parent: fp("root") });
  const c2 = makeTask({ id: "c2", parent: fp("root") });
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    // allTasks の並びは逆順にしておく。
    allTasks: [rootTask, c2, c1],
    projections: new Map([
      [fp("root"), projection(0, 2, [fp("c1"), fp("c2")])],
    ]),
  });

  expect(probe.latest.childTasks.map((t) => t.id)).toEqual(["c1", "c2"]);
});

test("subIssueCounts は projection の値を返す", () => {
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask],
    projections: new Map([[fp("root"), projection(1, 3)]]),
  });

  expect(probe.latest.subIssueCounts).toEqual({ done: 1, total: 3 });
});

test("isDone は projection の値を返す", () => {
  const child = makeTask({ id: "c1", parent: fp("root") });
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask, child],
    projections: new Map([
      [fp("root"), projection(1, 1, [fp("c1")])],
      [fp("c1"), projection(0, 0, [], true)],
    ]),
  });

  expect(probe.latest.isDone(fp("c1"))).toBe(true);
  expect(probe.latest.isDone(fp("root"))).toBe(false);
});

test("allTasks 未指定なら childTasks は固定参照の空配列になる", () => {
  const probe = renderHook({
    parentFilePath: fp("root"),
    projections: new Map([[fp("root"), projection(0, 1, [fp("c1")])]]),
  });
  const first = probe.latest.childTasks;

  probe.rerender({
    parentFilePath: fp("root"),
    projections: new Map([[fp("root"), projection(0, 2, [fp("c2")])]]),
  });

  expect(first).toEqual([]);
  expect(probe.latest.childTasks).toBe(first);
});

test("projections が空 Map なら 0/0・false になる", () => {
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask],
    projections: TaskProjection.emptyMap,
  });

  expect(probe.latest.subIssueCounts).toEqual({ done: 0, total: 0 });
  expect(probe.latest.isDone(fp("root"))).toBe(false);
  expect(probe.latest.childTasks).toEqual([]);
});

test("childFilePaths に allTasks 未登録の path が混ざっても解決できた分だけ返す", () => {
  const child = makeTask({ id: "c1", parent: fp("root") });
  const rootTask = makeTask({ id: "root" });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask, child],
    projections: new Map([
      [fp("root"), projection(0, 2, [fp("c1"), fp("missing")])],
    ]),
  });

  expect(probe.latest.childTasks.map((t) => t.id)).toEqual(["c1"]);
});

test("同じ入力で再レンダーしても戻り値の参照が変わらない", () => {
  const child = makeTask({ id: "c1", parent: fp("root") });
  const rootTask = makeTask({ id: "root" });
  const allTasks = [rootTask, child];
  const projections: TaskProjectionMap = new Map([
    [fp("root"), projection(0, 1, [fp("c1")])],
  ]);
  const args = { parentFilePath: fp("root"), allTasks, projections };

  const probe = renderHook(args);
  const before = {
    childTasks: probe.latest.childTasks,
    subIssueCounts: probe.latest.subIssueCounts,
    isDone: probe.latest.isDone,
  };

  probe.rerender(args);

  expect(probe.latest.childTasks).toBe(before.childTasks);
  expect(probe.latest.subIssueCounts).toBe(before.subIssueCounts);
  expect(probe.latest.isDone).toBe(before.isDone);
});
