import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import type { Task } from "@/types/task";
import {
  createProjectVersion,
  type ProjectCommandQueue,
} from "../../concurrency";
import type { ProjectAction, ProjectData } from "../../reducer";
import { reducer } from "../../reducer";
import type { ProjectState } from "../../state/projectState";
import type { TaskActionDeps } from "../deps";
import {
  dispatchLinkOperations,
  findLinkTaskByReference,
  linkRejectReasonToError,
} from "../linkOperations";

type TaskUpdatedAction = Extract<ProjectAction, { type: "task-updated" }>;

const asTaskUpdated = (
  action: ProjectAction | undefined,
): TaskUpdatedAction => {
  expect(action?.type).toBe("task-updated");
  return action as TaskUpdatedAction;
};

const makeData = (tasks: readonly Task[]): ProjectData => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [...tasks],
  columns: [
    { name: "Todo", order: 0 },
    { name: "Done", order: 1 },
  ],
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: TaskActionDeps;
};

const setupLoaded = (data: ProjectData): Harness => {
  const state = {
    current: { kind: "loaded", path: "/p", data } as ProjectState,
  };
  const actions: ProjectAction[] = [];
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  return {
    state,
    actions,
    deps: {
      projectVersion: createProjectVersion(),
      projectCommandQueue: queue,
      getState: () => state.current,
      dispatch: (action) => {
        actions.push(action);
        state.current = reducer(state.current, action);
      },
    },
  };
};

test("2 task 分の operations は task ごとに 1 dispatch される", () => {
  const source = makeTask({ id: "a", filePath: "tasks/a.md" });
  const target = makeTask({ id: "b", filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([source, target]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(harness.actions).toHaveLength(2);
  const first = asTaskUpdated(harness.actions[0]);
  const second = asTaskUpdated(harness.actions[1]);
  expect(first.originalFilePath).toBe("tasks/a.md");
  expect(first.task.links.linkedFilePaths).toEqual(["tasks/b.md"]);
  expect(second.originalFilePath).toBe("tasks/b.md");
  expect(second.task.links.reverseLinkedFilePaths).toEqual(["tasks/a.md"]);
});

test("同一 task への複数 operations は 1 dispatch に併合される（self-link 相当）", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/a.md"],
    reverseLinks: ["tasks/a.md"],
  });
  const harness = setupLoaded(makeData([source]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/a.md",
    },
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
  ]);

  expect(harness.actions).toHaveLength(1);
  const dispatched = asTaskUpdated(harness.actions[0]);
  expect(dispatched.task.links.linkedFilePaths).toEqual([]);
  expect(dispatched.task.links.reverseLinkedFilePaths).toEqual([]);
});

test("空 operations では dispatch されない", () => {
  const harness = setupLoaded(
    makeData([makeTask({ id: "a", filePath: "tasks/a.md" })]),
  );

  dispatchLinkOperations(harness.deps, []);

  expect(harness.actions).toHaveLength(0);
});

test("適用しても変化がない task は dispatch されない", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["tasks/b.md"],
  });
  const harness = setupLoaded(makeData([source]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(harness.actions).toHaveLength(0);
});

test("state に不在の task は skip され他の task は処理される", () => {
  const source = makeTask({ id: "a", filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([source]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/missing.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/a.md",
    },
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "tasks/b.md",
    },
  ]);

  expect(harness.actions).toHaveLength(1);
  expect(asTaskUpdated(harness.actions[0]).originalFilePath).toBe("tasks/a.md");
});

test("requiresValueTask 付き reverse append は value の task が state に不在なら skip される", () => {
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: [],
  });
  const harness = setupLoaded(makeData([target]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "tasks/deleted.md",
      requiresValueTask: true,
    },
  ]);

  expect(harness.actions).toHaveLength(0);
});

test("requiresValueTask 付き append の value は表記揺れ込みで解決され存在すれば適用される", () => {
  const source = makeTask({ id: "a", filePath: "tasks/a.md" });
  const target = makeTask({
    id: "b",
    filePath: "tasks/b.md",
    reverseLinks: [],
  });
  const harness = setupLoaded(makeData([source, target]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/b.md",
      field: "reverseLinkedFilePaths",
      value: "./tasks/a.md",
      requiresValueTask: true,
    },
  ]);

  expect(harness.actions).toHaveLength(1);
  expect(
    asTaskUpdated(harness.actions[0]).task.links.reverseLinkedFilePaths,
  ).toEqual(["./tasks/a.md"]);
});

test("flag なしの forward append は value の task が不在でも無条件適用される", () => {
  const source = makeTask({ id: "a", filePath: "tasks/a.md" });
  const harness = setupLoaded(makeData([source]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "append",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "./tasks/gone.md",
      at: 0,
    },
  ]);

  expect(harness.actions).toHaveLength(1);
  expect(asTaskUpdated(harness.actions[0]).task.links.linkedFilePaths).toEqual([
    "./tasks/gone.md",
  ]);
});

test("remove operation はガード対象外で value の task が不在でも適用される", () => {
  const source = makeTask({
    id: "a",
    filePath: "tasks/a.md",
    links: ["./tasks/gone.md"],
  });
  const harness = setupLoaded(makeData([source]));

  dispatchLinkOperations(harness.deps, [
    {
      op: "remove",
      filePath: "tasks/a.md",
      field: "linkedFilePaths",
      value: "./tasks/gone.md",
    },
  ]);

  expect(harness.actions).toHaveLength(1);
  expect(asTaskUpdated(harness.actions[0]).task.links.linkedFilePaths).toEqual(
    [],
  );
});

test("findLinkTaskByReference は raw 参照（dot-prefix / backslash）を canonical Task に解決する", () => {
  const target = makeTask({ id: "b", filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([target]));

  expect(findLinkTaskByReference(harness.deps.getState(), "./tasks/b.md")).toBe(
    target,
  );
  expect(findLinkTaskByReference(harness.deps.getState(), "tasks\\b.md")).toBe(
    target,
  );
});

test("findLinkTaskByReference は重複区切りの raw 参照も canonical Task に解決する", () => {
  const target = makeTask({ id: "b", filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([target]));

  expect(findLinkTaskByReference(harness.deps.getState(), "tasks//b.md")).toBe(
    target,
  );
});

test("findLinkTaskByReference は正規化同値の task が前方にあっても完全一致の task を優先する", () => {
  // 正規化すると "tasks/b.md" に一致する別 task を配列前方に置く
  const lookalike = makeTask({ id: "lookalike", filePath: "./tasks/b.md" });
  const exact = makeTask({ id: "b", filePath: "tasks/b.md" });
  const harness = setupLoaded(makeData([lookalike, exact]));

  expect(findLinkTaskByReference(harness.deps.getState(), "tasks/b.md")).toBe(
    exact,
  );
});

test("findLinkTaskByReference は解決不能な raw 参照に undefined を返す", () => {
  const harness = setupLoaded(
    makeData([makeTask({ id: "b", filePath: "tasks/b.md" })]),
  );

  expect(
    findLinkTaskByReference(harness.deps.getState(), "./tasks/gone.md"),
  ).toBeUndefined();
});

test.each([
  ["source-not-found", "リンク元のタスクが見つかりません"],
  ["self-link", "自分自身へはリンクできません"],
  ["target-not-found", "リンク先のタスクが見つかりません"],
] as const)("linkRejectReasonToError は %s を invalidState + 文言へ変換する", (reason, message) => {
  const error = linkRejectReasonToError(reason);

  expect(error).toEqual({ kind: "invalid-state", message });
});
