import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskLinks } from "@/domains/task-links";

test("buildAddLinkCandidates は self を候補から除外する", () => {
  const self = makeTask({ id: "self" });
  const other = makeTask({ id: "other" });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は既に linkedFilePaths にある task を除外する", () => {
  const other = makeTask({ id: "other" });
  const linked = makeTask({ id: "linked" });
  const self = makeTask({ id: "self", links: [linked.filePath] });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, linked],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は reverseLinkedFilePaths にある task を除外する", () => {
  const other = makeTask({ id: "other" });
  const reverse = makeTask({ id: "reverse" });
  const self = makeTask({
    id: "self",
    reverseLinks: [reverse.filePath],
  });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, reverse],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は parent と children を除外する", () => {
  const other = makeTask({ id: "other" });
  const parent = makeTask({ id: "parent" });
  const child = makeTask({ id: "child" });
  const self = makeTask({ id: "self" });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, parent, child],
    parentFilePath: parent.filePath,
    childrenFilePaths: [child.filePath],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は dot-prefix の raw 表記で登録済みなら canonical filePath の task も除外する", () => {
  const other = makeTask({ id: "other" });
  const linked = makeTask({ id: "linked", filePath: "tasks/b.md" });
  const self = makeTask({ id: "self", links: ["./tasks/b.md"] });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, linked],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は reverse 側の raw 表記でも task を除外する", () => {
  const other = makeTask({ id: "other" });
  const reverse = makeTask({ id: "reverse", filePath: "tasks/r.md" });
  const self = makeTask({ id: "self", reverseLinks: ["tasks\\r.md"] });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, reverse],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は重複区切りの raw 表記でも task を除外する", () => {
  const other = makeTask({ id: "other" });
  const linked = makeTask({ id: "linked", filePath: "tasks/b.md" });
  const self = makeTask({ id: "self", links: ["tasks//b.md"] });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [self, other, linked],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([other]);
});

test("buildAddLinkCandidates は allTasks 空配列で空配列を返す", () => {
  const self = makeTask({ id: "self" });

  const candidates = TaskLinks.buildAddLinkCandidates({
    self,
    allTasks: [],
    parentFilePath: null,
    childrenFilePaths: [],
  });

  expect(candidates).toEqual([]);
});
