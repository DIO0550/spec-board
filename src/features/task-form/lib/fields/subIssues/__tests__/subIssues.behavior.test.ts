import { expect, test } from "vitest";
import { TITLE_MAX_LENGTH } from "@/features/task-form/lib/fields/title";
import { Result } from "@/utils/result";
import { SubIssuesField } from "..";

test("finalize: 3 行入力をタイトル配列に変換する", () => {
  expect(SubIssuesField.finalize("a\nb\nc")).toEqual(["a", "b", "c"]);
});

test("finalize: 空行・空白のみ行は無視し、各行を trim する", () => {
  expect(SubIssuesField.finalize("a\n\n  \n b ")).toEqual(["a", "b"]);
});

test.each([[""], ["\n\n"]])("finalize: %j は空配列を返す", (input) => {
  expect(SubIssuesField.finalize(input)).toEqual([]);
});

test("finalize: CRLF 改行も行区切りとして扱う", () => {
  expect(SubIssuesField.finalize("a\r\nb")).toEqual(["a", "b"]);
});

test("finalize: 重複タイトルは許容する（衝突は BE 連番で回避）", () => {
  expect(SubIssuesField.finalize("a\na")).toEqual(["a", "a"]);
});

test("validate: 全行有効なら Ok", () => {
  expect(SubIssuesField.validate("a\nb")).toEqual(Result.ok(undefined));
});

test("validate: 空入力は Ok", () => {
  expect(SubIssuesField.validate("")).toEqual(Result.ok(undefined));
});

test("validate: 予約文字を含む行は行番号付き FORBIDDEN_CHAR エラー", () => {
  expect(SubIssuesField.validate("ok\na:b")).toEqual(
    Result.err({
      line: 2,
      error: { code: "FORBIDDEN_CHAR", chars: [":"] },
    }),
  );
});

test("validate: 文字数上限超過の行は行番号付き TOO_LONG エラー", () => {
  const long = "a".repeat(TITLE_MAX_LENGTH + 1);
  expect(SubIssuesField.validate(`ok\n${long}`)).toEqual(
    Result.err({
      line: 2,
      error: {
        code: "TOO_LONG",
        max: TITLE_MAX_LENGTH,
        actual: TITLE_MAX_LENGTH + 1,
      },
    }),
  );
});

test("validate: 空行混じりでも行番号は raw 入力基準（詰めない）", () => {
  expect(SubIssuesField.validate("ok\n\nbad:title")).toEqual(
    Result.err({
      line: 3,
      error: { code: "FORBIDDEN_CHAR", chars: [":"] },
    }),
  );
});

test("validate: kebab base が空になる記号のみの行は EMPTY エラー（空行 skip の対象外）", () => {
  expect(SubIssuesField.validate("ok\n---")).toEqual(
    Result.err({ line: 2, error: { code: "EMPTY" } }),
  );
});

test("validate: CRLF 改行でも行番号は raw 入力基準で数える", () => {
  expect(SubIssuesField.validate("ok\r\n\r\nbad:title")).toEqual(
    Result.err({
      line: 3,
      error: { code: "FORBIDDEN_CHAR", chars: [":"] },
    }),
  );
});
