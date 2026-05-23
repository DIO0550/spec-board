import { expect, test } from "vitest";
import type { TitleValidationError } from "@/features/task-form/lib/fields/title";
import { titleErrorMessage } from "../titleErrorMessage";

test("titleErrorMessage: 4 種のエラーコードを日本語化", () => {
  const cases: Array<[TitleValidationError, string, string]> = [
    [{ code: "EMPTY" }, "タイトルを入力してください", "EMPTY"],
    [
      { code: "DUPLICATE", fileName: "fix-login-bug.md" },
      "同じ名前のタスクがすでに存在します",
      "DUPLICATE",
    ],
    [
      { code: "TOO_LONG", max: 200, actual: 201 },
      "タイトルは200文字以内で入力してください",
      "TOO_LONG",
    ],
    [
      { code: "FORBIDDEN_CHAR", chars: ["<", ">"] },
      "使用できない文字が含まれています: < >",
      "FORBIDDEN_CHAR (multi)",
    ],
    [
      { code: "FORBIDDEN_CHAR", chars: ["<"] },
      "使用できない文字が含まれています: <",
      "FORBIDDEN_CHAR (single)",
    ],
  ];

  for (const [error, expected, label] of cases) {
    expect(titleErrorMessage(error), label).toBe(expected);
  }
});
