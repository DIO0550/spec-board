import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskHierarchy } from "@/domains/task-hierarchy";

test("countSubIssueProgress は完了数と総数を返す", () => {
  const descendants = [
    makeTask({ id: "a", status: "Done" }),
    makeTask({ id: "b", status: "Todo" }),
    makeTask({ id: "c", status: "Done" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 2,
    total: 3,
  });
});

test("countSubIssueProgress は子孫が空なら done/total ともに 0", () => {
  expect(TaskHierarchy.countSubIssueProgress([], "Done")).toEqual({
    done: 0,
    total: 0,
  });
});

test("countSubIssueProgress は全件完了なら done と total が一致する", () => {
  const descendants = [
    makeTask({ id: "a", status: "Done" }),
    makeTask({ id: "b", status: "Done" }),
  ];
  expect(TaskHierarchy.countSubIssueProgress(descendants, "Done")).toEqual({
    done: 2,
    total: 2,
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
  });
});
