import { expect, test } from "vitest";
import { LabelRegistry } from "@/domains/label-registry";
import { Task } from "@/types/task";

const task = (id: string, labels: string[]): Task =>
  Task.fromPayload({
    id,
    title: id,
    status: "Todo",
    labels,
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/${id}.md`,
  });

test("複数タスクのラベルを名前ごとに集計する", () => {
  const tasks = [
    task("a", ["bug", "frontend"]),
    task("b", ["bug"]),
    task("c", ["frontend", "a11y"]),
  ];
  expect(LabelRegistry.labelUsageCounts(tasks)).toEqual({
    bug: 2,
    frontend: 2,
    a11y: 1,
  });
});

test("同一タスク内の重複ラベルは 1 件として数える", () => {
  const tasks = [task("a", ["bug", "bug", "bug"])];
  expect(LabelRegistry.labelUsageCounts(tasks)).toEqual({ bug: 1 });
});

test("空文字ラベルは数えない", () => {
  const tasks = [task("a", ["", "bug", ""])];
  expect(LabelRegistry.labelUsageCounts(tasks)).toEqual({ bug: 1 });
});

test("タスクが 0 件のとき空オブジェクトを返す", () => {
  expect(LabelRegistry.labelUsageCounts([])).toEqual({});
});

test("ラベル無しのタスクのみのとき空オブジェクトを返す", () => {
  const tasks = [task("a", []), task("b", [])];
  expect(LabelRegistry.labelUsageCounts(tasks)).toEqual({});
});

test("__proto__ / constructor のようなプロトタイプキー名でも own property として正しく数える", () => {
  const tasks = [
    task("a", ["__proto__"]),
    task("b", ["__proto__", "constructor"]),
    task("c", ["constructor"]),
  ];
  const result = LabelRegistry.labelUsageCounts(tasks);
  expect(Object.hasOwn(result, "__proto__")).toBe(true);
  expect(Object.hasOwn(result, "constructor")).toBe(true);
  // own property としての値を直接取り出す（プロトタイプチェーンを経由しない）。
  expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toBe(2);
  expect(Object.getOwnPropertyDescriptor(result, "constructor")?.value).toBe(2);
});
