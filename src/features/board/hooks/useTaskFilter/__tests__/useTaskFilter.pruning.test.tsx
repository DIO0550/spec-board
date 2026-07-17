import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import type {
  TaskFilterCriteria,
  TaskFilterOptions,
} from "@/features/board/lib/applyTaskFilter";
import { type UseTaskFilterResult, useTaskFilter } from "..";

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

const taskWith = (
  id: string,
  status: string,
  labels: string[],
  milestone: string | undefined,
): Task => {
  const payload: TaskFromPayloadInput = {
    id,
    title: id,
    status,
    milestone,
    labels,
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
  taskWith("a", "Todo", ["bug"], "v0.3"),
  taskWith("b", "Doing", ["chore"], "v0.4"),
  taskWith("c", "Done", [], undefined),
];

type ProbeProps = {
  options: TaskFilterOptions;
  initialCriteria: TaskFilterCriteria;
  onResult: (result: UseTaskFilterResult) => void;
};

const Probe = ({ options, initialCriteria, onResult }: ProbeProps) => {
  const result = useTaskFilter(tasks, options);
  const { setCriteria } = result;
  useEffect(() => {
    setCriteria(initialCriteria);
  }, [initialCriteria, setCriteria]);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mountWith = async (
  options: TaskFilterOptions,
  initialCriteria: TaskFilterCriteria,
): Promise<UseTaskFilterResult | null> => {
  let latest: UseTaskFilterResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(Probe, {
        options,
        initialCriteria,
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

const allOptions: TaskFilterOptions = {
  statuses: ["Todo", "Doing", "Done"],
  labels: ["bug", "chore"],
  milestoneNames: ["v0.3", "v0.4"],
};

test("選択肢に存在する条件はそのまま反映される", async () => {
  const result = await mountWith(allOptions, {
    keyword: "",
    labels: [],
    priorities: [],
    statuses: ["Todo"],
    milestone: { kind: "all" },
  });
  expect(result?.criteria.statuses).toEqual(["Todo"]);
  expect(result?.filtered.map((t) => t.id)).toEqual(["a"]);
  expect(result?.isActive).toBe(true);
});

test("選択肢から外れた status は render 中に間引かれ filtered に反映される", async () => {
  // status "Doing" が選択肢から消えた状態。隠れフィルタを残さず全件が見える。
  const result = await mountWith(
    {
      statuses: ["Todo", "Done"],
      labels: ["bug", "chore"],
      milestoneNames: ["v0.3", "v0.4"],
    },
    {
      keyword: "",
      labels: [],
      priorities: [],
      statuses: ["Doing"],
      milestone: { kind: "all" },
    },
  );
  expect(result?.criteria.statuses).toEqual([]);
  expect(result?.filtered.map((t) => t.id)).toEqual(["a", "b", "c"]);
  expect(result?.isActive).toBe(false);
});

test("削除されたマイルストーン条件は render 中に all へ戻る", async () => {
  const result = await mountWith(
    {
      statuses: ["Todo", "Doing", "Done"],
      labels: ["bug", "chore"],
      milestoneNames: ["v0.4"],
    },
    {
      keyword: "",
      labels: [],
      priorities: [],
      statuses: [],
      milestone: { kind: "milestone", name: "v0.3" },
    },
  );
  expect(result?.criteria.milestone).toEqual({ kind: "all" });
  expect(result?.filtered.map((t) => t.id)).toEqual(["a", "b", "c"]);
  expect(result?.isActive).toBe(false);
});

test("選択肢に依存しない keyword / priorities は保持される", async () => {
  const result = await mountWith(
    {
      statuses: ["Todo", "Done"],
      labels: ["bug", "chore"],
      milestoneNames: ["v0.4"],
    },
    {
      keyword: "a",
      labels: [],
      priorities: [],
      statuses: ["Doing"],
      milestone: { kind: "milestone", name: "v0.3" },
    },
  );
  expect(result?.criteria.keyword).toBe("a");
  expect(result?.criteria.statuses).toEqual([]);
  expect(result?.criteria.milestone).toEqual({ kind: "all" });
  expect(result?.isActive).toBe(true);
});
