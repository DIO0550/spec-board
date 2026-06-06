import { expect, test } from "vitest";
import { computeMilestoneProgress } from "@/features/milestoneView/hooks/useMilestoneProgress";
import { Task, type TaskPayload } from "@/types/task";

const taskWith = (id: string, milestone: string, status: string): Task => {
  const payload: TaskPayload = {
    id,
    title: id,
    status,
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

test("done カラム解決時は done/total の進捗率を返す", () => {
  const tasks = [
    taskWith("a", "v0.3", "Done"),
    taskWith("b", "v0.3", "Done"),
    taskWith("c", "v0.3", "Todo"),
    taskWith("d", "v0.3", "Doing"),
  ];
  const progress = computeMilestoneProgress(["v0.3"], tasks, "Done");
  expect(progress.get("v0.3")).toEqual({ total: 4, done: 2, ratio: 0.5 });
});

test("所属 0 件のマイルストーンは total=0・ratio=undefined", () => {
  const progress = computeMilestoneProgress(["v0.3"], [], "Done");
  expect(progress.get("v0.3")).toEqual({ total: 0, done: 0, ratio: undefined });
});

test("done カラム未解決（undefined）のとき ratio は undefined", () => {
  const tasks = [taskWith("a", "v0.3", "Done")];
  const progress = computeMilestoneProgress(["v0.3"], tasks, undefined);
  expect(progress.get("v0.3")?.ratio).toBeUndefined();
  expect(progress.get("v0.3")?.total).toBe(1);
});
