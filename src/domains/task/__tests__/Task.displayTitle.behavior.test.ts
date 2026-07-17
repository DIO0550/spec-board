import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { Task } from "..";

test.each<{
  name: string;
  title: string;
  filePath: string;
  id: string;
  expected: string;
}>([
  {
    name: "title 非空 はそのまま返す",
    title: "My Task",
    filePath: "tasks/foo.md",
    id: "id-1",
    expected: "My Task",
  },
  {
    name: "title 空文字 + filePath foo.md は basename の拡張子除去",
    title: "",
    filePath: "tasks/foo.md",
    id: "id-1",
    expected: "foo",
  },
  {
    name: "title 空白のみ + filePath foo.MD は case-insensitive で除去",
    title: "   ",
    filePath: "tasks/foo.MD",
    id: "id-1",
    expected: "foo",
  },
  {
    name: "title 空 + filePath 拡張子なし はそのまま basename",
    title: "",
    filePath: "tasks/foo",
    id: "id-1",
    expected: "foo",
  },
  {
    name: "title 空 + filePath dotfile (.foo) は非除去（先頭ドットは残す）",
    title: "",
    filePath: "tasks/.foo",
    id: "id-1",
    expected: ".foo",
  },
  {
    name: "title 空 + filePath 他拡張子 (.txt) は非除去",
    title: "",
    filePath: "tasks/foo.txt",
    id: "id-1",
    expected: "foo.txt",
  },
  {
    name: "title 空 + filePath 空 は id にフォールバック",
    title: "",
    filePath: "",
    id: "id-1",
    expected: "id-1",
  },
  {
    name: "title / filePath / id 全て空 は空文字を返す",
    title: "",
    filePath: "",
    id: "",
    expected: "",
  },
])("$name", ({ title, filePath, id, expected }) => {
  const task = makeTask({ id, title, filePath });
  expect(Task.displayTitle(task)).toBe(expected);
});
