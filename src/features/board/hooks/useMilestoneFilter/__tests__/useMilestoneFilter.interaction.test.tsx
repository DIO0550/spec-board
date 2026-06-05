import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import {
  type MilestoneFilter,
  type UseMilestoneFilterResult,
  useMilestoneFilter,
} from "@/features/board/hooks/useMilestoneFilter";
import { Task, type TaskPayload } from "@/types/task";

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previous: boolean | undefined;

beforeAll(() => {
  previous = reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
});

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

const taskWith = (id: string, milestone: string | undefined): Task => {
  const payload: TaskPayload = {
    id,
    title: id,
    status: "Todo",
    milestone,
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `${id}.md`,
    extras: {},
    warnings: [],
  };
  return Task.fromPayload(payload);
};

const tasks: Task[] = [
  taskWith("a", "v0.3"),
  taskWith("b", "v0.4"),
  taskWith("c", undefined),
  taskWith("d", "v0.3"),
];

const Probe = ({
  filter,
  onResult,
}: {
  filter: MilestoneFilter;
  onResult: (result: UseMilestoneFilterResult) => void;
}) => {
  const result = useMilestoneFilter(tasks);
  useEffect(() => {
    result.setFilter(filter);
  }, [filter, result.setFilter]);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mountWith = async (
  filter: MilestoneFilter,
): Promise<UseMilestoneFilterResult | null> => {
  let latest: UseMilestoneFilterResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(Probe, {
        filter,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return latest;
};

test("all は全タスクを返す", async () => {
  const result = await mountWith({ kind: "all" });
  expect(result?.filtered.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
});

test("milestone(name) は該当 milestone のみ返す", async () => {
  const result = await mountWith({ kind: "milestone", name: "v0.3" });
  expect(result?.filtered.map((t) => t.id)).toEqual(["a", "d"]);
});

test("unassigned は milestone 未割当のみ返す", async () => {
  const result = await mountWith({ kind: "unassigned" });
  expect(result?.filtered.map((t) => t.id)).toEqual(["c"]);
});

test("該当なしの milestone は空配列を返す", async () => {
  const result = await mountWith({ kind: "milestone", name: "v9.9" });
  expect(result?.filtered).toEqual([]);
});
