import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskHierarchy } from "@/domains/task-hierarchy";

test("countSubIssueProgress は完了数・総数・進捗率を返す", () => {
  const descendants = [
    makeTask({ id: "a", status: "Done" }),
    makeTask({ id: "b", status: "Todo" }),
    makeTask({ id: "c", status: "Done" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 2,
    total: 3,
    percentage: 67,
  });
});

test("countSubIssueProgress は子孫が空なら done/total/percentage ともに 0", () => {
  expect(TaskHierarchy.countSubIssueProgress([], "Done")).toEqual({
    done: 0,
    total: 0,
    percentage: 0,
  });
});

test("countSubIssueProgress は全件完了なら done と total が一致し percentage=100", () => {
  const descendants = [
    makeTask({ id: "a", status: "Done" }),
    makeTask({ id: "b", status: "Done" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 2,
    total: 2,
    percentage: 100,
  });
});

test("countSubIssueProgress は doneColumn 以外のステータスを未完了として扱う", () => {
  const descendants = [
    makeTask({ id: "a", status: "In Progress" }),
    makeTask({ id: "b", status: "Done" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 1,
    total: 2,
    percentage: 50,
  });
});

test("countSubIssueProgress は percentage を Math.round で丸める（3 件中 1 件 done で 33）", () => {
  const descendants = [
    makeTask({ id: "a", status: "Done" }),
    makeTask({ id: "b", status: "Todo" }),
    makeTask({ id: "c", status: "Todo" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 1,
    total: 3,
    percentage: 33,
  });
});
