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
    message: "プロジェクトが開かれていません",
  });
  expect(message).toBe("プロジェクトが開かれていません");
});

test("kind=partial-move は message をそのまま返す", () => {
  const underlying = new TauriError("IO_ERROR", "card-order 保存に失敗");
  const message = projectErrorMessage({
    kind: "partial-move",
    message: "カラムの移動は完了しましたが、並び順の保存に失敗しました。",
    underlying,
  });
  expect(message).toBe(
    "カラムの移動は完了しましたが、並び順の保存に失敗しました。",
  );
});
