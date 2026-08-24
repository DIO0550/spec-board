import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri";
import { projectErrorMessage } from "..";

test("kind=tauri / HAS_CHILDREN は専用文言に翻訳される", () => {
  const tauriError = new TauriError(
    "HAS_CHILDREN",
    "task has children: foo.md (children: a.md)",
  );
  const message = projectErrorMessage({ kind: "tauri", error: tauriError });
  expect(message).toBe("子タスクが存在するため削除できません");
});

test("kind=tauri / NOT_FOUND は TauriError.message をそのまま返す", () => {
  const tauriError = new TauriError(
    "NOT_FOUND",
    "ファイルが見つかりません: x.md",
  );
  const message = projectErrorMessage({ kind: "tauri", error: tauriError });
  expect(message).toBe("ファイルが見つかりません: x.md");
});

test("kind=invalid-state は message をそのまま返す", () => {
  const message = projectErrorMessage({
    kind: "invalid-state",
    reason: "not-loaded",
    message: "プロジェクトが開かれていません",
  });
  expect(message).toBe("プロジェクトが開かれていません");
});
