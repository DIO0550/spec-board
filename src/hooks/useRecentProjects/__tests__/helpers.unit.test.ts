import { expect, test } from "vitest";
import {
  addRecentProject,
  normalizeRecentProjects,
  type RecentProject,
} from "../helpers";

test("addRecentProject は新規パスを先頭に name 付きで追加する", () => {
  const result = addRecentProject([], "/home/user/proj");
  expect(result).toEqual([{ path: "/home/user/proj", name: "proj" }]);
});

test("既存パスを再追加すると重複させず先頭へ繰り上げる", () => {
  const current: RecentProject[] = [
    { path: "/a", name: "a" },
    { path: "/b", name: "b" },
  ];
  const result = addRecentProject(current, "/b");
  expect(result.map((project) => project.path)).toEqual(["/b", "/a"]);
});

test("履歴は最大 8 件で切り詰められる", () => {
  let history: RecentProject[] = [];
  for (let i = 0; i < 10; i += 1) {
    history = addRecentProject(history, `/p${i}`);
  }
  expect(history).toHaveLength(8);
  expect(history[0].path).toBe("/p9");
});

test.each([
  ["配列でない", { not: "array" }],
  ["null", null],
])("normalizeRecentProjects は不正値（%s）で空配列を返す", (_label, input) => {
  expect(normalizeRecentProjects(input)).toEqual([]);
});

test("normalizeRecentProjects は path を欠く要素を除外する", () => {
  const result = normalizeRecentProjects([
    { path: "/ok", name: "ok" },
    { name: "no-path" },
    { path: "" },
  ]);
  expect(result).toEqual([{ path: "/ok", name: "ok" }]);
});

test("normalizeRecentProjects は復元時に重複 path を先頭優先で除去する", () => {
  const result = normalizeRecentProjects([
    { path: "/a", name: "first" },
    { path: "/b", name: "b" },
    { path: "/a", name: "dup" },
  ]);
  expect(result).toEqual([
    { path: "/a", name: "first" },
    { path: "/b", name: "b" },
  ]);
});

test("normalizeRecentProjects は復元時に最大 8 件へ切り詰める", () => {
  const stored = Array.from({ length: 12 }, (_, i) => ({
    path: `/p${i}`,
    name: `p${i}`,
  }));
  const result = normalizeRecentProjects(stored);
  expect(result).toHaveLength(8);
  expect(result[0].path).toBe("/p0");
  expect(result[7].path).toBe("/p7");
});
