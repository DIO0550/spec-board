import { expect, test } from "vitest";
import { combineMarkdown } from "..";

const FRONTMATTER = "---\ntitle: タスク\nstatus: todo\n---";

test("frontmatter と本文を改行区切りで結合する", () => {
  expect(combineMarkdown(FRONTMATTER, "本文です")).toBe(
    `${FRONTMATTER}\n本文です`,
  );
});

test("空本文のとき frontmatter のみ（末尾改行付き）を返す", () => {
  expect(combineMarkdown(FRONTMATTER, "")).toBe(`${FRONTMATTER}\n`);
});

test("本文に --- を含んでも誤分割せず単純連結する", () => {
  expect(combineMarkdown(FRONTMATTER, "前\n---\n後")).toBe(
    `${FRONTMATTER}\n前\n---\n後`,
  );
});

test("複数行本文の改行を保ったまま連結する", () => {
  expect(combineMarkdown(FRONTMATTER, "1行目\n2行目\n3行目")).toBe(
    `${FRONTMATTER}\n1行目\n2行目\n3行目`,
  );
});
