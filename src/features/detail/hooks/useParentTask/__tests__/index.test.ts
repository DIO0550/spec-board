import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  type UseParentTaskArgs,
  type UseParentTaskResult,
  useParentTask,
} from "../index";

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

/**
 * テスト用の Task を生成するファクトリ。
 * @param overrides - 上書きフィールド
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "t1",
    title: "title",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/t1.md",
    ...overrides,
  });

/**
 * useParentTask の戻り値を観測する Probe。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseParentTaskArgs & {
    onResult: (r: UseParentTaskResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useParentTask(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、最新値を取得する。
 * @param args - useParentTask の引数
 * @returns latest accessor
 */
const renderHook = (args: UseParentTaskArgs) => {
  let latest: UseParentTaskResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseParentTaskResult) => {
    latest = r;
  };
  act(() => {
    root?.render(createElement(Probe, { ...args, onResult: handleResult }));
  });
  return {
    get latest(): UseParentTaskResult {
      return latest as UseParentTaskResult;
    },
  };
};

test("parentFilePath が存在し allTasks にマッチする親があるとき parentTask を返す", () => {
  const parent = makeTask({
    id: "parent",
    title: "parent",
    filePath: "tasks/parent.md",
  });
  const child = makeTask({
    id: "child",
    title: "child",
    filePath: "tasks/child.md",
    parent: "tasks/parent.md",
  });
  const probe = renderHook({ task: child, allTasks: [parent, child] });
  expect(probe.latest.parentTask).toBe(parent);
});

test("parentFilePath が undefined のとき parentTask: null を返す", () => {
  const child = makeTask({ id: "child", filePath: "tasks/child.md" });
  const probe = renderHook({ task: child, allTasks: [child] });
  expect(probe.latest.parentTask).toBeNull();
});

test("parentFilePath が空文字のとき parentTask: null を返す", () => {
  const child = makeTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "",
  });
  const probe = renderHook({ task: child, allTasks: [child] });
  expect(probe.latest.parentTask).toBeNull();
});

test("parentFilePath は存在するが allTasks に該当 task が無いとき null を返す（孤児参照、throw しない）", () => {
  const child = makeTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "tasks/missing.md",
  });
  const probe = renderHook({ task: child, allTasks: [child] });
  expect(probe.latest.parentTask).toBeNull();
});

test("allTasks が undefined のとき parentTask: null を返す", () => {
  const child = makeTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "tasks/parent.md",
  });
  const probe = renderHook({ task: child, allTasks: undefined });
  expect(probe.latest.parentTask).toBeNull();
});

test("allTasks が空配列のとき parentTask: null を返す", () => {
  const child = makeTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "tasks/parent.md",
  });
  const probe = renderHook({ task: child, allTasks: [] });
  expect(probe.latest.parentTask).toBeNull();
});

test("./tasks/parent.md と tasks/parent.md のような表記揺れは parentReferencesTaskPath により等価とみなされる", () => {
  const parent = makeTask({
    id: "parent",
    title: "parent",
    filePath: "tasks/parent.md",
  });
  const child = makeTask({
    id: "child",
    filePath: "tasks/child.md",
    parent: "./tasks/parent.md",
  });
  const probe = renderHook({ task: child, allTasks: [parent, child] });
  expect(probe.latest.parentTask).toBe(parent);
});
