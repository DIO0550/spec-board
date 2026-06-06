import { expect, test } from "vitest";
import { LinksField } from "..";

test("empty は空の links を返す", () => {
  expect(LinksField.empty()).toEqual({ links: [] });
});

test("add で filePath が 1 件追加される", () => {
  const field = LinksField.add(LinksField.empty(), "tasks/a.md");
  expect(field.links).toEqual(["tasks/a.md"]);
});

test("add を連続すると入力順に複数件保持される", () => {
  const field = LinksField.add(
    LinksField.add(LinksField.empty(), "tasks/a.md"),
    "tasks/b.md",
  );
  expect(field.links).toEqual(["tasks/a.md", "tasks/b.md"]);
});

test("既に含む filePath の add は no-op（dedup）", () => {
  const field = LinksField.add(
    LinksField.add(LinksField.empty(), "tasks/a.md"),
    "tasks/a.md",
  );
  expect(field.links).toEqual(["tasks/a.md"]);
});

test("空文字の add は no-op", () => {
  const field = LinksField.add(LinksField.empty(), "");
  expect(field.links).toEqual([]);
});

test("remove で指定 filePath が除外される", () => {
  const base = LinksField.add(
    LinksField.add(LinksField.empty(), "tasks/a.md"),
    "tasks/b.md",
  );
  const field = LinksField.remove(base, "tasks/a.md");
  expect(field.links).toEqual(["tasks/b.md"]);
});

test("finalize は現 links 配列をそのまま返す", () => {
  const base = LinksField.add(LinksField.empty(), "tasks/a.md");
  expect(LinksField.finalize(base)).toEqual(["tasks/a.md"]);
});
