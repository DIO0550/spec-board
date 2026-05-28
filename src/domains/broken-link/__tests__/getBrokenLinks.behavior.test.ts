import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath, getBrokenLinks } from "..";

const existing = () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const b = makeTask({ id: "b", filePath: "tasks/b.md" });
  return { a, b, map: buildTasksByNormalizedPath([a, b]) };
};

test("parent broken のみ: parent=true, 他は empty", () => {
  const { map } = existing();
  const target = makeTask({ id: "x", parent: "tasks/missing.md" });
  const result = getBrokenLinks(target, map);
  expect(result.parent).toBe(true);
  expect(result.links.size).toBe(0);
  expect(result.children.size).toBe(0);
  expect(result.reverseLinks.size).toBe(0);
});

test("parent は存在し、links に 1 件 broken / 1 件正常", () => {
  const { map } = existing();
  const target = makeTask({
    id: "x",
    parent: "tasks/a.md",
    links: ["tasks/b.md", "tasks/missing.md"],
  });
  const result = getBrokenLinks(target, map);
  expect(result.parent).toBe(false);
  expect(result.links).toEqual(new Set(["tasks/missing.md"]));
});

test("children 一部 broken は children set に raw 値で残る", () => {
  const { map } = existing();
  const target = makeTask({
    id: "x",
    children: ["tasks/a.md", "tasks/dead.md"],
  });
  const result = getBrokenLinks(target, map);
  expect(result.children).toEqual(new Set(["tasks/dead.md"]));
});

test("reverseLinks 一部 broken は reverseLinks set に raw 値で残る", () => {
  const { map } = existing();
  const target = makeTask({
    id: "x",
    reverseLinks: ["tasks/dead.md", "tasks/b.md"],
  });
  const result = getBrokenLinks(target, map);
  expect(result.reverseLinks).toEqual(new Set(["tasks/dead.md"]));
});

test("すべて正常: parent=false、全 Set が empty", () => {
  const { map } = existing();
  const target = makeTask({
    id: "x",
    parent: "tasks/a.md",
    links: ["tasks/b.md"],
    children: ["tasks/a.md"],
    reverseLinks: ["tasks/b.md"],
  });
  const result = getBrokenLinks(target, map);
  expect(result.parent).toBe(false);
  expect(result.links.size).toBe(0);
  expect(result.children.size).toBe(0);
  expect(result.reverseLinks.size).toBe(0);
});

test("parent 未指定 (undefined) は parent=false", () => {
  const { map } = existing();
  const target = makeTask({ id: "x" });
  const result = getBrokenLinks(target, map);
  expect(result.parent).toBe(false);
});

test("broken な ref は表記揺れの raw 値をそのまま保持する", () => {
  const { map } = existing();
  const target = makeTask({
    id: "x",
    links: ["./tasks/missing.md", "tasks\\dead.md"],
  });
  const result = getBrokenLinks(target, map);
  expect(result.links).toEqual(
    new Set(["./tasks/missing.md", "tasks\\dead.md"]),
  );
});
