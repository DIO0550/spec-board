import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import type { Column } from "@/types/column";
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

const DEFAULT_COLUMNS: Column[] = [{ name: "Done", order: 0 }];

test("3 階層構造で descendantTasks が 3 件（子 1 + 孫 2）を返す", () => {
  const grand1 = makeTask({ id: "g1", parent: fp("c1") });
  const grand2 = makeTask({ id: "g2", parent: fp("c1") });
  const child = makeTask({
    id: "c1",
    parent: fp("root"),
    children: [fp("g1"), fp("g2")],
  });
  const rootTask = makeTask({
    id: "root",
    children: [fp("c1")],
  });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask, child, grand1, grand2],
    columns: DEFAULT_COLUMNS,
    doneColumn: "Done",
  });

  const ids = probe.latest.descendantTasks.map((t) => t.id).sort();
  expect(ids).toEqual(["c1", "g1", "g2"]);
});

test("childTasks は引き続き直下子のみを返す", () => {
  const grand1 = makeTask({ id: "g1", parent: fp("c1") });
  const child = makeTask({
    id: "c1",
    parent: fp("root"),
    children: [fp("g1")],
  });
  const rootTask = makeTask({
    id: "root",
    children: [fp("c1")],
  });

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks: [rootTask, child, grand1],
    columns: DEFAULT_COLUMNS,
    doneColumn: "Done",
  });

  expect(probe.latest.childTasks.map((t) => t.id)).toEqual(["c1"]);
});

test("サイクル A→B→A 下でも descendantTasks は有限件数を返す（例外を投げない）", () => {
  const a = makeTask({ id: "a", children: [fp("b")] });
  const b = makeTask({
    id: "b",
    parent: fp("a"),
    children: [fp("a")],
  });

  const probe = renderHook({
    parentFilePath: fp("a"),
    allTasks: [a, b],
    columns: DEFAULT_COLUMNS,
    doneColumn: "Done",
  });

  expect(probe.latest.descendantTasks.map((t) => t.id)).toEqual(["b"]);
});

test("columns / doneColumn のみが変わっても descendantTasks の参照は維持される（useMemo 独立性）", () => {
  const child = makeTask({ id: "c1", parent: fp("root") });
  const rootTask = makeTask({ id: "root", children: [fp("c1")] });
  const allTasks = [rootTask, child];

  const probe = renderHook({
    parentFilePath: fp("root"),
    allTasks,
    columns: [{ name: "Done", order: 0 }],
    doneColumn: "Done",
  });

  const before = probe.latest.descendantTasks;

  probe.rerender({
    parentFilePath: fp("root"),
    allTasks,
    columns: [{ name: "Closed", order: 0 }],
    doneColumn: "Closed",
  });

  expect(probe.latest.descendantTasks).toBe(before);
});
