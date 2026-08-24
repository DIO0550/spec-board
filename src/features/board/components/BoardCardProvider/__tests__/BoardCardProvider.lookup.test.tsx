import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { TaskProjection } from "@/domains/task-projection";
import type { MilestoneDefinition } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import {
  type BoardCardApi,
  BoardCardProvider,
  type BoardCardProviderProps,
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
 * テスト用に最小限の Task を構築する。
 * @param patch 上書きしたい一部フィールド
 * @returns Task
 */
const makeTask = (patch: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: patch.id ?? "id",
    title: patch.title ?? "title",
    status: patch.status ?? "Todo",
    labels: patch.labels ?? [],
    body: patch.body ?? "",
    filePath: patch.filePath ?? taskFilePathFixture("tasks/x.md"),
    links: patch.links ?? [],
    reverseLinks: patch.reverseLinks ?? [],
    children: patch.children ?? [],
    parent: patch.parent,
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
        projections={overrides.projections ?? TaskProjection.emptyMap}
        tasks={overrides.tasks ?? []}
        allTasks={overrides.allTasks ?? []}
        tasksByNormalizedPath={overrides.tasksByNormalizedPath}
        milestonesByName={overrides.milestonesByName}
        doneColumn={overrides.doneColumn}
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

test("byPath は allTasks から該当 task を返し、不在時は undefined を返す", () => {
  const a = makeTask({ id: "a", filePath: taskFilePathFixture("tasks/a.md") });
  const probe = mountProbe({ allTasks: [a] });
  expect(probe.latest.byPath(taskFilePathFixture("tasks/a.md"))?.id).toBe("a");
  expect(
    probe.latest.byPath(taskFilePathFixture("tasks/missing.md")),
  ).toBeUndefined();
});

test("milestoneByName は Map.get と同じ挙動で undefined/該当を返す", () => {
  const def: MilestoneDefinition = {
    name: "v1",
    title: "v1 リリース",
    state: "open",
  };
  const milestonesByName = new Map([["v1", def]]);
  const probe = mountProbe({ milestonesByName });
  expect(probe.latest.milestoneByName("v1")).toBe(def);
  expect(probe.latest.milestoneByName("missing")).toBeUndefined();
});

test("milestonesByName 未指定時は空 Map を公開する", () => {
  const empty = mountProbe();
  expect(empty.latest.milestonesByName.size).toBe(0);
});

test("milestonesByName 指定時は同一参照を返す", () => {
  const milestonesByName = new Map<string, MilestoneDefinition>();
  const probe = mountProbe({ milestonesByName });
  expect(probe.latest.milestonesByName).toBe(milestonesByName);
});

test("doneColumn 省略時は default 'Done' がカラム名判定に使われる", () => {
  const probe = mountProbe({});

  expect(probe.latest.isDoneColumn("Done")).toBe(true);
  expect(probe.latest.isDoneColumn("Todo")).toBe(false);
});

test("isDoneColumn は effective doneColumn と一致するかで判定する", () => {
  const probe = mountProbe({ doneColumn: "完了" });
  expect(probe.latest.isDoneColumn("完了")).toBe(true);
  expect(probe.latest.isDoneColumn("Todo")).toBe(false);
});

test("descendantCount は子なしのとき固定参照 (total: 0, done: 0) を返す", () => {
  const a = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    children: [],
  });
  const probe = mountProbe({ allTasks: [a] });
  const first = probe.latest.descendantCount(taskFilePathFixture("tasks/a.md"));
  const second = probe.latest.descendantCount(
    taskFilePathFixture("tasks/a.md"),
  );
  expect(first).toEqual({ total: 0, done: 0 });
  expect(first).toBe(second);
});

test("descendantCount は子あり一部 done のとき total と done を返す", () => {
  const child1 = makeTask({
    id: "c1",
    filePath: taskFilePathFixture("tasks/c1.md"),
    status: "Done",
    parent: taskFilePathFixture("tasks/p.md"),
  });
  const child2 = makeTask({
    id: "c2",
    filePath: taskFilePathFixture("tasks/c2.md"),
    status: "Todo",
    parent: taskFilePathFixture("tasks/p.md"),
  });
  const parent = makeTask({
    id: "p",
    filePath: taskFilePathFixture("tasks/p.md"),
    children: [
      taskFilePathFixture("tasks/c1.md"),
      taskFilePathFixture("tasks/c2.md"),
    ],
  });
  const probe = mountProbe({
    allTasks: [parent, child1, child2],
    doneColumn: "Done",
    projections: new Map([
      [
        taskFilePathFixture("tasks/p.md"),
        {
          subIssueProgress: { done: 1, total: 2 },
          isDone: false,
          childFilePaths: [
            taskFilePathFixture("tasks/c1.md"),
            taskFilePathFixture("tasks/c2.md"),
          ],
        },
      ],
    ]),
  });
  expect(
    probe.latest.descendantCount(taskFilePathFixture("tasks/p.md")),
  ).toEqual({
    total: 2,
    done: 1,
  });
});

test("descendantCount は projection 未登録の filePath で 0/0 の固定参照を返す", () => {
  const probe = mountProbe({ allTasks: [] });

  const first = probe.latest.descendantCount(
    taskFilePathFixture("tasks/missing.md"),
  );
  const second = probe.latest.descendantCount(
    taskFilePathFixture("tasks/other.md"),
  );

  expect(first).toEqual({ done: 0, total: 0 });
  expect(first).toBe(second);
});

test("isDone は projection の値を返す", () => {
  const probe = mountProbe({
    projections: new Map([
      [
        taskFilePathFixture("tasks/a.md"),
        {
          subIssueProgress: { done: 0, total: 0 },
          isDone: true,
          childFilePaths: [],
        },
      ],
    ]),
  });

  expect(probe.latest.isDone(taskFilePathFixture("tasks/a.md"))).toBe(true);
  expect(probe.latest.isDone(taskFilePathFixture("tasks/unknown.md"))).toBe(
    false,
  );
});

test("tasksInColumn は該当 column のタスクを status 別に返す", () => {
  const a = makeTask({
    id: "a",
    filePath: taskFilePathFixture("tasks/a.md"),
    status: "Todo",
  });
  const b = makeTask({
    id: "b",
    filePath: taskFilePathFixture("tasks/b.md"),
    status: "In Progress",
  });
  const probe = mountProbe({ tasks: [a, b] });
  expect(probe.latest.tasksInColumn("Todo")).toEqual([a]);
  expect(probe.latest.tasksInColumn("In Progress")).toEqual([b]);
});

test("tasksInColumn は存在しない column 名で空配列固定参照を返す", () => {
  const probe = mountProbe({ tasks: [] });
  const first = probe.latest.tasksInColumn("missing");
  const second = probe.latest.tasksInColumn("missing");
  expect(first).toEqual([]);
  expect(first).toBe(second);
});

test("totalCountInColumn はフィルタ非適用の allTasks から status 一致件数を返す", () => {
  const all = [
    makeTask({ filePath: taskFilePathFixture("tasks/a.md"), status: "Todo" }),
    makeTask({ filePath: taskFilePathFixture("tasks/b.md"), status: "Todo" }),
    makeTask({ filePath: taskFilePathFixture("tasks/c.md"), status: "Done" }),
  ];
  // tasks（フィルタ後）を 1 件に絞っても、総件数は allTasks 基準で変わらない。
  const probe = mountProbe({ tasks: [all[0] as Task], allTasks: all });
  expect(probe.latest.totalCountInColumn("Todo")).toBe(2);
  expect(probe.latest.totalCountInColumn("Done")).toBe(1);
});

test("totalCountInColumn は該当タスクのないカラムで 0 を返す", () => {
  const probe = mountProbe({
    tasks: [],
    allTasks: [
      makeTask({ filePath: taskFilePathFixture("tasks/a.md"), status: "Todo" }),
    ],
  });
  expect(probe.latest.totalCountInColumn("Empty")).toBe(0);
});
