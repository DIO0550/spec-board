import { beforeEach, expect, test, vi } from "vitest";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import {
  getColumns as getColumnsInvoke,
  TauriError,
  updateColumns as updateColumnsInvoke,
} from "@/lib/tauri";
import { Result } from "@/utils/result";
import {
  createProjectVersion,
  invalidateProject,
  type ProjectCommandQueue,
} from "../../concurrency";
import type { ProjectAction, ProjectData } from "../../reducer";
import { reducer } from "../../reducer";
import type { ProjectState } from "../../state/projectState";
import {
  type ReorderColumnsCallbacks,
  ReorderExecution,
  ReorderSnapshot,
} from "../reorderColumns";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    updateColumns: vi.fn(),
    getColumns: vi.fn(),
  };
});

const updateColumnsMock = vi.mocked(updateColumnsInvoke);
const getColumnsMock = vi.mocked(getColumnsInvoke);

const makeData = (): ProjectData => ({
  watcherSession: WATCHER_SESSION_FIXTURE,
  tasks: [],
  columns: [
    { name: "A", order: 0 },
    { name: "B", order: 1 },
    { name: "C", order: 2 },
  ],
  doneColumn: "C",
  projections: new Map(),
  milestoneProjections: new Map(),
  taskTree: [],
  openRequestId: 0,
  loadWarnings: [],
});

type Harness = {
  state: { current: ProjectState };
  actions: ProjectAction[];
  deps: Parameters<typeof ReorderExecution.run>[0];
};

const setupLoaded = (data: ProjectData): Harness => {
  const state = {
    current: { kind: "loaded", path: "/p", data } as ProjectState,
  };
  const actions: ProjectAction[] = [];
  const queue: ProjectCommandQueue = { current: Promise.resolve() };
  const version = createProjectVersion();
  return {
    state,
    actions,
    deps: {
      projectVersion: version,
      projectCommandQueue: queue,
      getState: () => state.current,
      requestResync: () => {},
      dispatch: (action) => {
        actions.push(action);
        state.current = reducer(state.current, action);
      },
    },
  };
};

const runReorder = (
  harness: Harness,
  fromColumnName: string,
  toColumnName: string,
  callbacks?: ReorderColumnsCallbacks,
) => {
  const data = (harness.state.current as { data: ProjectData }).data;
  const snapshot = ReorderSnapshot.from(data, fromColumnName, toColumnName);
  return ReorderExecution.run(
    harness.deps,
    { fromColumnName, toColumnName },
    snapshot,
    harness.deps.projectVersion.current,
    callbacks,
  );
};

beforeEach(() => {
  updateColumnsMock.mockReset();
  getColumnsMock.mockReset();
});

test("楽観 dispatch (columns-replaced with afterColumns) が 1 回走る", async () => {
  const harness = setupLoaded(makeData());
  updateColumnsMock.mockResolvedValue(Result.ok(undefined));

  await runReorder(harness, "A", "C");

  const optimistic = harness.actions.filter(
    (a) => a.type === "columns-replaced",
  );
  expect(optimistic.length).toBeGreaterThanOrEqual(1);
  expect(optimistic[0]).toEqual({
    type: "columns-replaced",
    columns: [
      { name: "B", order: 0 },
      { name: "C", order: 1 },
      { name: "A", order: 2 },
    ],
    renames: [],
    doneColumn: undefined,
  });
});

test("楽観 dispatch 後 onOptimisticApplied が解決済み index 付きで 1 度呼ばれる", async () => {
  const harness = setupLoaded(makeData());
  updateColumnsMock.mockResolvedValue(Result.ok(undefined));
  const onOptimisticApplied = vi.fn();

  await runReorder(harness, "A", "C", { onOptimisticApplied });

  expect(onOptimisticApplied).toHaveBeenCalledTimes(1);
  expect(onOptimisticApplied).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
    columnName: "A",
    fromIndex: 0,
    toIndex: 2,
  });
});

test("invoke 成功時 rollback dispatch なし / Result.ok({applied: true})", async () => {
  const harness = setupLoaded(makeData());
  updateColumnsMock.mockResolvedValue(Result.ok(undefined));
  const onRollback = vi.fn();

  const result = await runReorder(harness, "A", "C", { onRollback });

  expect(result).toEqual(Result.ok({ applied: true }));
  expect(onRollback).not.toHaveBeenCalled();
  const replacedCount = harness.actions.filter(
    (a) =>
      a.type === "columns-replaced" &&
      a.columns.map((c) => c.name).join(",") === "A,B,C",
  ).length;
  expect(replacedCount).toBe(0);
});

test("invoke 失敗 (tauri err) 時 rollback dispatch (columns-replaced with beforeColumns) が 1 回走る", async () => {
  const harness = setupLoaded(makeData());
  updateColumnsMock.mockResolvedValue(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );

  await runReorder(harness, "A", "C");

  const replacedActions = harness.actions.filter(
    (a) => a.type === "columns-replaced",
  );
  expect(replacedActions[replacedActions.length - 1]).toEqual({
    type: "columns-replaced",
    columns: [
      { name: "A", order: 0 },
      { name: "B", order: 1 },
      { name: "C", order: 2 },
    ],
    renames: [],
    doneColumn: undefined,
  });
});

test("invoke 失敗時 onRollback が解決済み index 付きで呼ばれる", async () => {
  const harness = setupLoaded(makeData());
  updateColumnsMock.mockResolvedValue(
    Result.err(new TauriError("UNKNOWN", "boom")),
  );
  const onRollback = vi.fn();

  await runReorder(harness, "A", "C", { onRollback });

  expect(onRollback).toHaveBeenCalledTimes(1);
  expect(onRollback).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
    columnName: "A",
    fromIndex: 0,
    toIndex: 2,
  });
});

test("invoke 失敗時 Result.err(ProjectError.tauri(...)) を返す", async () => {
  const harness = setupLoaded(makeData());
  const tauriError = new TauriError("UNKNOWN", "boom");
  updateColumnsMock.mockResolvedValue(Result.err(tauriError));

  const result = await runReorder(harness, "A", "C");

  expect(result.ok).toBe(false);
  expect(result).toMatchObject({
    ok: false,
    error: { kind: "tauri" },
  });
});

test("project switch 以外の invalid-state (visibleData null 等) は rollback dispatch + onRollback を実行する", async () => {
  // snapshot 採取後 / queue 実行前に state が idle に巻き戻ったケースを再現する。
  // runUpdateColumnsInsideQueue が visibleData === null で invalid-state を返すが、
  // 戻り message は PROJECT_SWITCHED_MESSAGE ではないので reducer は loaded のまま。
  // この場合は楽観 dispatch を rollback すべき。
  const harness = setupLoaded(makeData());
  const data = (harness.state.current as { data: ProjectData }).data;
  const snapshot = ReorderSnapshot.from(data, "A", "C");

  // snapshot 採取後に getState を idle 返却に差し替える
  harness.deps.getState = () => ({ kind: "idle" }) as ProjectState;

  const onRollback = vi.fn();
  const result = await ReorderExecution.run(
    harness.deps,
    { fromColumnName: "A", toColumnName: "C" },
    snapshot,
    harness.deps.projectVersion.current,
    { onRollback },
  );

  expect(result).toMatchObject({
    ok: false,
    error: { kind: "invalid-state" },
  });
  // PROJECT_SWITCHED_MESSAGE 以外の invalid-state なので rollback が走る
  expect(onRollback).toHaveBeenCalledTimes(1);
  const replacedActions = harness.actions.filter(
    (a) => a.type === "columns-replaced",
  );
  expect(replacedActions[replacedActions.length - 1]).toEqual({
    type: "columns-replaced",
    columns: [
      { name: "A", order: 0 },
      { name: "B", order: 1 },
      { name: "C", order: 2 },
    ],
    renames: [],
    doneColumn: undefined,
  });
});

test("project switch 中 (invalid-state) は rollback dispatch / onRollback を行わず invalid-state を返す", async () => {
  const harness = setupLoaded(makeData());
  const initialVersion = harness.deps.projectVersion.current;
  invalidateProject(harness.deps.projectVersion);
  const onRollback = vi.fn();

  const data = (harness.state.current as { data: ProjectData }).data;
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const result = await ReorderExecution.run(
    harness.deps,
    { fromColumnName: "A", toColumnName: "C" },
    snapshot,
    initialVersion,
    { onRollback },
  );

  expect(result.ok).toBe(false);
  expect(result).toMatchObject({
    ok: false,
    error: { kind: "invalid-state" },
  });
  expect(onRollback).not.toHaveBeenCalled();
  const rollbackCols = harness.actions.filter(
    (a) =>
      a.type === "columns-replaced" &&
      a.columns.map((c) => c.name).join(",") === "A,B,C",
  );
  expect(rollbackCols).toEqual([]);
});
