import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { useStableTaskList } from "@/features/board/hooks/useStableTaskList";
import { Task } from "@/types/task";

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

const makeTask = (filePath: string): Task =>
  Task.fromPayload({
    id: filePath,
    filePath,
    title: "T",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    extras: {},
    warnings: [],
  });

const taskA = makeTask("tasks/a.md");
const taskB = makeTask("tasks/b.md");

/** hook の戻り値を観測用コールバックへ渡すテスト専用コンポーネント。 */
const Probe = ({
  tasks,
  onResult,
}: {
  tasks: readonly Task[];
  onResult: (result: readonly Task[]) => void;
}) => {
  onResult(useStableTaskList(tasks));
  return null;
};

/** 与えた配列列を順に render し、各 render の戻り値を集める。 */
const renderSequence = (
  sequence: ReadonlyArray<readonly Task[]>,
): (readonly Task[])[] => {
  const results: (readonly Task[])[] = [];
  const onResult = (result: readonly Task[]): void => {
    results.push(result);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  for (const tasks of sequence) {
    act(() => {
      root?.render(createElement(Probe, { tasks, onResult }));
    });
  }
  return results;
};

test("同一要素の別配列を渡しても同一参照を返す", () => {
  const results = renderSequence([[taskA], [taskA]]);

  expect(results[results.length - 1]).toBe(results[0]);
});

test("要素が違えば新しい参照を返す", () => {
  const results = renderSequence([[taskA], [taskB]]);

  expect(results[results.length - 1]).not.toBe(results[0]);
  expect(results[results.length - 1]).toEqual([taskB]);
});

test("長さが違えば新しい参照を返す", () => {
  const results = renderSequence([[taskA], [taskA, taskB]]);

  expect(results[results.length - 1]).not.toBe(results[0]);
  expect(results[results.length - 1]).toHaveLength(2);
});
