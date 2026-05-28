import { expect, test } from "vitest";
import { normalizeRefPathForLookup } from "..";

test.each([
  {
    ref: "tasks/a.md",
    expected: "tasks/a.md",
    label: "通常の相対 path はそのまま正規化される",
  },
  {
    ref: "./tasks/a.md",
    expected: "tasks/a.md",
    label: "./ prefix が除去される",
  },
  {
    ref: "tasks\\a.md",
    expected: "tasks/a.md",
    label: "backslash 区切りが / に正規化される",
  },
])("$label", ({ ref, expected }) => {
  expect(normalizeRefPathForLookup(ref)).toBe(expected);
});

test.each([
  { ref: "", label: "空文字 は undefined" },
  { ref: "/abs.md", label: "POSIX 絶対 path は undefined" },
  { ref: "\\abs.md", label: "Windows 区切り絶対 path は undefined" },
  { ref: "C:/foo.md", label: "Windows drive prefix は undefined" },
])("$label", ({ ref }) => {
  expect(normalizeRefPathForLookup(ref)).toBeUndefined();
});

test("`./tasks/x.md` と `tasks/x.md` で同じ結果を返す", () => {
  expect(normalizeRefPathForLookup("./tasks/x.md")).toBe(
    normalizeRefPathForLookup("tasks/x.md"),
  );
});

test("`tasks\\x.md` と `tasks/x.md` で同じ結果を返す", () => {
  expect(normalizeRefPathForLookup("tasks\\x.md")).toBe(
    normalizeRefPathForLookup("tasks/x.md"),
  );
});
