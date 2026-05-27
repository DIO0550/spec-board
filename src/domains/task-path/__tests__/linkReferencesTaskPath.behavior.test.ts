import { expect, test } from "vitest";
import { linkReferencesTaskPath } from "..";

test.each([
  {
    link: "tasks/a.md",
    filePath: "tasks/a.md",
    expected: true,
    label: "完全一致",
  },
  {
    link: "./tasks/a.md",
    filePath: "tasks/a.md",
    expected: true,
    label: "./ prefix 吸収",
  },
  {
    link: "tasks\\a.md",
    filePath: "tasks/a.md",
    expected: true,
    label: "backslash 区切り正規化",
  },
  {
    link: "",
    filePath: "tasks/a.md",
    expected: false,
    label: "空文字列 link",
  },
  {
    link: "/tasks/a.md",
    filePath: "tasks/a.md",
    expected: false,
    label: "絶対 path（/ 始まり）",
  },
  {
    link: "tasks/a.md",
    filePath: "tasks/b.md",
    expected: false,
    label: "別の filePath",
  },
])("linkReferencesTaskPath: $label", ({ link, filePath, expected }) => {
  expect(linkReferencesTaskPath(link, filePath)).toBe(expected);
});
