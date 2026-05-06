import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import {
  type UseDetailLabelsArgs,
  type UseDetailLabelsResult,
  useDetailLabels,
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
  filePath: "/p",
  ...overrides,
});

/**
 * useDetailLabels の戻り値を観測する Probe。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseDetailLabelsArgs & {
    onResult: (r: UseDetailLabelsResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useDetailLabels(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、最新値を取得する。
 * @param args - useDetailLabels の引数
 * @returns latest accessor + rerender
 */
const renderHook = (args: UseDetailLabelsArgs) => {
  let latest: UseDetailLabelsResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const handleResult = (r: UseDetailLabelsResult) => {
    latest = r;
  };
  act(() => {
    root?.render(createElement(Probe, { ...args, onResult: handleResult }));
  });
  const rerender = (next: UseDetailLabelsArgs) => {
    act(() => {
      root?.render(createElement(Probe, { ...next, onResult: handleResult }));
    });
  };
  return {
    get latest(): UseDetailLabelsResult {
      return latest as UseDetailLabelsResult;
    },
    rerender,
  };
};

test("add 1 回で onTaskUpdate に追加後の labels が渡る", () => {
  const onTaskUpdate = vi.fn();
  const task = makeTask({ id: "t1", labels: ["existing"] });
  const probe = renderHook({ task, onTaskUpdate });
  act(() => {
    probe.latest.add("new-label");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["existing", "new-label"],
  });
});

test("同フレーム連続 add で labels が合算される", () => {
  const onTaskUpdate = vi.fn();
  const task = makeTask({ id: "t1", labels: ["a"] });
  const probe = renderHook({ task, onTaskUpdate });
  act(() => {
    probe.latest.add("b");
    probe.latest.add("c");
  });
  expect(onTaskUpdate).toHaveBeenNthCalledWith(1, "t1", { labels: ["a", "b"] });
  expect(onTaskUpdate).toHaveBeenNthCalledWith(2, "t1", {
    labels: ["a", "b", "c"],
  });
});

test("重複 add は onTaskUpdate を呼ばない", () => {
  const onTaskUpdate = vi.fn();
  const task = makeTask({ id: "t1", labels: ["a"] });
  const probe = renderHook({ task, onTaskUpdate });
  act(() => {
    probe.latest.add("a");
  });
  expect(onTaskUpdate).not.toHaveBeenCalled();
});

test("remove で除外配列が渡る", () => {
  const onTaskUpdate = vi.fn();
  const task = makeTask({ id: "t1", labels: ["a", "b"] });
  const probe = renderHook({ task, onTaskUpdate });
  act(() => {
    probe.latest.remove("a");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", { labels: ["b"] });
});

test("同フレーム連続 remove も合算される", () => {
  const onTaskUpdate = vi.fn();
  const task = makeTask({ id: "t1", labels: ["a", "b", "c"] });
  const probe = renderHook({ task, onTaskUpdate });
  act(() => {
    probe.latest.remove("a");
    probe.latest.remove("b");
  });
  expect(onTaskUpdate).toHaveBeenNthCalledWith(1, "t1", {
    labels: ["b", "c"],
  });
  expect(onTaskUpdate).toHaveBeenNthCalledWith(2, "t1", { labels: ["c"] });
});

test("task.labels prop 変更後の add は新 labels ベースで合算される（render 中代入）", () => {
  const onTaskUpdate = vi.fn();
  const task1 = makeTask({ id: "t1", labels: ["a"] });
  const probe = renderHook({ task: task1, onTaskUpdate });
  const task2 = makeTask({ id: "t1", labels: ["a", "b"] });
  probe.rerender({ task: task2, onTaskUpdate });
  act(() => {
    probe.latest.add("c");
  });
  expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
    labels: ["a", "b", "c"],
  });
});
