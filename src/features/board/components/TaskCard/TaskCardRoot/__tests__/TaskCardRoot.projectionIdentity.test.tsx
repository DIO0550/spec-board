import { act, type ReactNode, useContext } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import {
  ProjectData as ProjectDataDomain,
  type ProjectData as ProjectDataT,
} from "@/domains/project-data";
import type {
  TaskProjection,
  TaskProjectionMap,
} from "@/domains/task-projection";
import { WATCHER_SESSION_FIXTURE } from "@/domains/watcher-session/__tests__/fixture";
import { Task, type TaskPayload } from "@/types/task";
import { BoardCardProvider } from "../../../BoardCardProvider";
import {
  TaskCardContext,
  type TaskCardContextValue,
} from "../../TaskCardContext";
import { TaskCardRoot } from "..";

// `Column` は子コンポーネントを差し込む prop を持たないため、context 値の観測は
// Column が TaskCard へ渡すのと同じ入力（allTasks 由来の Task を毎 render 新しい
// 配列に詰めた childTasks）を TaskCardRoot に与えて行う。Column に観測用 prop を
// 足すのは本 spec と無関係な API 変更になるため採らない。

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

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "t",
    title: "T",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: taskFilePathFixture("tasks/t.md"),
    ...overrides,
  });

const projection = (
  done: number,
  total: number,
  childFilePaths: readonly ReturnType<typeof taskFilePathFixture>[] = [],
): TaskProjection => ({
  subIssueProgress: { done, total },
  isDone: false,
  childFilePaths,
});

const parent = createTask({
  id: "p",
  title: "親",
  filePath: taskFilePathFixture("tasks/p.md"),
  children: [taskFilePathFixture("tasks/c.md")],
});
const child = createTask({
  id: "c",
  title: "子",
  filePath: taskFilePathFixture("tasks/c.md"),
  parent: taskFilePathFixture("tasks/p.md"),
});
const other = createTask({
  id: "o",
  title: "他",
  filePath: taskFilePathFixture("tasks/o.md"),
});
const allTasks = [parent, child, other];

/** TaskCard.Root 配下で context 値を観測するテスト専用コンポーネント。 */
const ContextProbe = ({
  onValue,
}: {
  onValue: (value: TaskCardContextValue | null) => void;
}) => {
  onValue(useContext(TaskCardContext));
  return null;
};

/** projections を差し替えながら render し、観測できた context 値を集める。 */
const renderWithProjections = (
  sequence: readonly TaskProjectionMap[],
): TaskCardContextValue[] => {
  const values: TaskCardContextValue[] = [];
  const onValue = (value: TaskCardContextValue | null): void => {
    values.push(value as TaskCardContextValue);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const treeOf = (projections: TaskProjectionMap): ReactNode => (
    <BoardCardProvider
      projections={projections}
      tasks={[parent]}
      allTasks={allTasks}
      doneColumn="Done"
    >
      <TaskCardRoot
        task={parent}
        fromColumn="Todo"
        // Column は render ごとに新しい配列を作る。その挙動を再現する。
        childTasks={[child]}
      >
        <ContextProbe onValue={onValue} />
      </TaskCardRoot>
    </BoardCardProvider>
  );
  for (const projections of sequence) {
    act(() => {
      root?.render(treeOf(projections));
    });
  }
  return values;
};

const withParent = (done: number, total: number): TaskProjectionMap =>
  new Map([
    [
      taskFilePathFixture("tasks/p.md"),
      projection(done, total, [taskFilePathFixture("tasks/c.md")]),
    ],
  ]);

test("無関係カードの projection だけが変わっても対象カードの Context Value は同一参照", () => {
  const first = withParent(0, 1);
  const second = new Map(first);
  second.set(taskFilePathFixture("tasks/o.md"), projection(1, 1));

  const values = renderWithProjections([first, second]);

  expect(values[values.length - 1]).toBe(values[0]);
});

test("等価な projections で再同期しても Context Value は同一参照", () => {
  // map 単位の据え置きは store 側（ProjectData.replaceProjections）が担う。
  // 実パイプラインと同じく、等価な応答をマージした結果を Provider へ渡す。
  const data: ProjectDataT = {
    watcherSession: WATCHER_SESSION_FIXTURE,
    tasks: [parent, child, other],
    columns: [{ name: "Todo", order: 0 }],
    doneColumn: "Done",
    projections: withParent(0, 1),
    milestoneProjections: new Map(),
    taskTree: [],
    openRequestId: 1,
    loadWarnings: [],
  };
  const merged = ProjectDataDomain.replaceProjections(data, {
    projections: withParent(0, 1),
    milestoneProjections: data.milestoneProjections,
    taskTree: [],
  });

  const values = renderWithProjections([data.projections, merged.projections]);

  expect(merged).toBe(data);
  expect(values[values.length - 1]).toBe(values[0]);
});

test("allTasks の他要素だけが変わっても Context Value は同一参照", () => {
  const projections = withParent(0, 1);
  const values = renderWithProjections([projections, projections]);

  expect(values[values.length - 1]).toBe(values[0]);
});

test("自カードの projection が変われば Context Value が更新される", () => {
  const values = renderWithProjections([withParent(0, 1), withParent(1, 1)]);

  const latest = values[values.length - 1];
  expect(latest).not.toBe(values[0]);
  expect(latest.subIssueCounts).toEqual({ done: 1, total: 1 });
});

test("子行の完了状態が変われば childRows が更新される", () => {
  const before = new Map([
    [
      taskFilePathFixture("tasks/p.md"),
      projection(0, 1, [taskFilePathFixture("tasks/c.md")]),
    ],
    [taskFilePathFixture("tasks/c.md"), projection(0, 0)],
  ]);
  const after = new Map([
    [
      taskFilePathFixture("tasks/p.md"),
      projection(0, 1, [taskFilePathFixture("tasks/c.md")]),
    ],
    [
      taskFilePathFixture("tasks/c.md"),
      {
        subIssueProgress: { done: 0, total: 0 },
        isDone: true,
        childFilePaths: [],
      },
    ],
  ]);

  const values = renderWithProjections([before, after]);

  expect(values[0].childRows[0]?.isDone).toBe(false);
  expect(values[values.length - 1].childRows[0]?.isDone).toBe(true);
});
