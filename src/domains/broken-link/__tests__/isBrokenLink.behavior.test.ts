import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath, isBrokenLink } from "..";

const setup = () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  const b = makeTask({ id: "b", filePath: "tasks/b.md" });
  return buildTasksByNormalizedPath([a, b]);
};

test("Map に存在する path は false", () => {
  expect(isBrokenLink("tasks/a.md", setup())).toBe(false);
});

test("Map に存在しない path は true", () => {
  expect(isBrokenLink("tasks/missing.md", setup())).toBe(true);
});

test.each([
  { ref: "./tasks/a.md", label: "./ prefix" },
  { ref: "tasks\\a.md", label: "backslash 区切り" },
])("表記揺れ ($label) でも解決して false", ({ ref }) => {
  expect(isBrokenLink(ref, setup())).toBe(false);
});

test.each([
  { ref: "/tasks/a.md", label: "POSIX 絶対 path" },
  { ref: "\\tasks\\a.md", label: "Windows 区切り絶対 path" },
  { ref: "C:/tasks/a.md", label: "Windows drive prefix" },
  { ref: "", label: "空文字" },
])("非対象 ref ($label) は broken 扱いで true", ({ ref }) => {
  expect(isBrokenLink(ref, setup())).toBe(true);
});
