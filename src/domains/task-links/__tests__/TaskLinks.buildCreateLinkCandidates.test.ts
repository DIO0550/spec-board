import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("buildCreateLinkCandidates は parent も選択済みも無ければ全 allTasks を返す", () => {
  const a = makeTask({ id: "a" });
  const b = makeTask({ id: "b" });

  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [a, b],
    parentFilePath: undefined,
    selectedFilePaths: [],
  });

  expect(candidates).toEqual([a, b]);
});

test("buildCreateLinkCandidates は parentFilePath の task を除外する", () => {
  const parent = makeTask({ id: "parent" });
  const other = makeTask({ id: "other" });

  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [parent, other],
    parentFilePath: parent.filePath,
    selectedFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildCreateLinkCandidates は選択済み filePath の task を除外する", () => {
  const selected = makeTask({ id: "selected" });
  const other = makeTask({ id: "other" });

  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [selected, other],
    parentFilePath: undefined,
    selectedFilePaths: [selected.filePath],
  });

  expect(candidates).toEqual([other]);
});

test("buildCreateLinkCandidates は allTasks 空配列で空配列を返す", () => {
  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [],
    parentFilePath: undefined,
    selectedFilePaths: [],
  });

  expect(candidates).toEqual([]);
});

test("buildCreateLinkCandidates は parent が選択済みにも含まれる場合でも破綻しない", () => {
  const parent = makeTask({ id: "parent" });
  const other = makeTask({ id: "other" });

  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [parent, other],
    parentFilePath: parent.filePath,
    selectedFilePaths: [parent.filePath],
  });

  expect(candidates).toEqual([other]);
});

test("buildCreateLinkCandidates は表記揺れを吸収せず完全一致のみ除外する", () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });

  const candidates = TaskLinks.buildCreateLinkCandidates({
    allTasks: [a],
    parentFilePath: undefined,
    selectedFilePaths: ["./tasks/a.md"],
  });

  // 表記揺れ（./tasks/a.md）は完全一致しないため除外されず候補に残る。
  expect(candidates).toEqual([a]);
});
