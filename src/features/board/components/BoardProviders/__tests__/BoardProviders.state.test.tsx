import { act, type ReactNode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { Column as ColumnType } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { type BoardCardApi, useBoardCard } from "../../BoardCardProvider";
import { type BoardColumnApi, useBoardColumn } from "../../BoardColumnProvider";
import { BoardProviders } from "..";

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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "id",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

/**
 * useBoardCard / useBoardColumn を観測する Probe。BoardProviders 配下に置く。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: {
  onCard: (api: BoardCardApi) => void;
  onColumn: (api: BoardColumnApi) => void;
}) => {
  const card = useBoardCard();
  const column = useBoardColumn();
  // Context 値が変化したときだけ通知する。依存配列を省略すると毎レンダー発火し、
  // 将来コールバック側で state 更新が入った場合に無限ループの原因になり得る。
  // onCard / onColumn も exhaustive-deps の要件として依存に含めるが、
  // mountProbe 内で固定参照のため通常は余計な再発火を起こさない。
  useEffect(() => {
    props.onCard(card);
    props.onColumn(column);
  }, [card, column, props.onCard, props.onColumn]);
  return null;
};

type MountOverrides = {
  columns?: readonly ColumnType[];
  tasks?: readonly Task[];
  allTasks?: readonly Task[];
  dndDisabled?: boolean;
};

/**
 * BoardProviders 配下に Probe を mount し、Card / Column 両 context を観測する。
 * @param overrides 上書きしたい props
 * @returns latest accessor
 */
const mountProbe = (overrides: MountOverrides = {}) => {
  let latestCard: BoardCardApi | null = null;
  let latestColumn: BoardColumnApi | null = null;
  const handleCard = (api: BoardCardApi) => {
    latestCard = api;
  };
  const handleColumn = (api: BoardColumnApi) => {
    latestColumn = api;
  };
  // allTasks 省略時は tasks を流用する（Column.dnd.test.tsx の renderWithProviders と同型）。
  // 別々に [] へフォールバックすると tasks のみ渡したケースで byPath / 集計系が空になる。
  const tasks = overrides.tasks ?? [];
  const allTasks = overrides.allTasks ?? tasks;
  const tree: ReactNode = (
    <BoardProviders
      columns={overrides.columns ?? [{ name: "Todo", order: 0 }]}
      tasks={tasks}
      allTasks={allTasks}
      dndDisabled={overrides.dndDisabled}
    >
      <Probe onCard={handleCard} onColumn={handleColumn} />
    </BoardProviders>
  );
  act(() => {
    root?.render(tree);
  });
  return {
    get card(): BoardCardApi {
      return latestCard as BoardCardApi;
    },
    get column(): BoardColumnApi {
      return latestColumn as BoardColumnApi;
    },
  };
};

test("dndDisabled=true を渡すと Card / Column 両方の context に反映される", () => {
  const probe = mountProbe({ dndDisabled: true });
  expect(probe.card.dndDisabled).toBe(true);
  expect(probe.column.dndDisabled).toBe(true);
});

test("dndDisabled 省略時は Card / Column 両方とも false がデフォルト", () => {
  const probe = mountProbe();
  expect(probe.card.dndDisabled).toBe(false);
  expect(probe.column.dndDisabled).toBe(false);
});

test("allTasks が Column 側の taskCountInColumn 集計に到達する", () => {
  const todoA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const todoB = makeTask({ id: "b", filePath: "tasks/b.md", status: "Todo" });
  const probe = mountProbe({
    columns: [{ name: "Todo", order: 0 }],
    tasks: [],
    allTasks: [todoA, todoB],
  });
  expect(probe.column.taskCountInColumn("Todo")).toBe(2);
});

test("allTasks が Card 側の byPath lookup に到達する（両 Provider に同値で配線される）", () => {
  const taskA = makeTask({ id: "a", filePath: "tasks/a.md", status: "Todo" });
  const probe = mountProbe({
    tasks: [],
    allTasks: [taskA],
  });
  expect(probe.card.byPath("tasks/a.md")?.filePath).toBe("tasks/a.md");
  expect(probe.card.byPath("tasks/missing.md")).toBeUndefined();
});
