import { expect, test } from "vitest";
import { makeTask, warn } from "@/domains/__tests__/taskFixtures";
import { countTasksWithParseError } from "..";

test("0 件: パースエラーを持つ task が無い配列で 0", () => {
  const a = makeTask({ id: "a" });
  const b = makeTask({ id: "b", warnings: [warn("parentCycle")] });
  expect(countTasksWithParseError([a, b])).toBe(0);
});

test("複数 task が各々 invalid を持つ: 3 タスク中 2 タスクで 2", () => {
  const a = makeTask({ id: "a", warnings: [warn("invalidStatusUsedDefault")] });
  const b = makeTask({ id: "b" });
  const c = makeTask({ id: "c", warnings: [warn("invalidParentIgnored")] });
  expect(countTasksWithParseError([a, b, c])).toBe(2);
});

test("1 タスクが複数 invalid を持ってもカウントは 1", () => {
  const a = makeTask({
    id: "a",
    warnings: [
      warn("invalidStatusUsedDefault"),
      warn("invalidParentIgnored"),
      warn("nonStringExtraKeyIgnored"),
    ],
  });
  expect(countTasksWithParseError([a])).toBe(1);
});

test("除外コードのみの task は非カウント", () => {
  const a = makeTask({ id: "a", warnings: [warn("parentCycle")] });
  const b = makeTask({ id: "b", warnings: [warn("parentNotFound")] });
  expect(countTasksWithParseError([a, b])).toBe(0);
});

test("invalidDue のみの task 配列は 0（parse-error 対象外）", () => {
  const a = makeTask({ id: "a", warnings: [warn("invalidDue")] });
  const b = makeTask({ id: "b", warnings: [warn("invalidDue")] });
  expect(countTasksWithParseError([a, b])).toBe(0);
});
