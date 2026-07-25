import { expect, test } from "vitest";
import {
  buildMutationFailureMessage,
  isMutationCommand,
} from "@/lib/tauri/mutationFailureMessage";
import { TauriError } from "@/lib/tauri/tauriError";

test.for([
  "create_task",
  "update_task",
  "delete_task",
  "move_task",
  "add_link",
  "remove_link",
  "update_columns",
] as const)("allowlist の書き込み cmd '%s' で isMutationCommand が true", (cmd) => {
  expect(isMutationCommand(cmd)).toBe(true);
});

test.for([
  "get_tasks",
  "get_columns",
  "get_labels",
  "open_project",
] as const)("allowlist 外の cmd '%s' で isMutationCommand が false", (cmd) => {
  expect(isMutationCommand(cmd)).toBe(false);
});

test.for([
  "toString",
  "constructor",
  "hasOwnProperty",
  "__proto__",
] as const)("Object.prototype 継承プロパティ '%s' は isMutationCommand が false", (cmd) => {
  expect(isMutationCommand(cmd)).toBe(false);
});

test("buildMutationFailureMessage は操作別固定文 + TauriError 詳細を組む", () => {
  const error = new TauriError("IO_ERROR", "書き込み失敗");
  expect(buildMutationFailureMessage("create_task", error)).toBe(
    "タスクの作成に失敗しました: 書き込み失敗",
  );
});

test("move_task はカラム間移動 / 同一カラム並び替えを通じて「タスクの移動」文になる", () => {
  const error = new TauriError("IO_ERROR", "書き込みに失敗しました");
  expect(buildMutationFailureMessage("move_task", error)).toBe(
    "タスクの移動に失敗しました: 書き込みに失敗しました",
  );
});

test("HAS_CHILDREN は専用文へ翻訳される", () => {
  const error = new TauriError("HAS_CHILDREN", "task has children");
  expect(buildMutationFailureMessage("delete_task", error)).toBe(
    "タスクの削除に失敗しました: 子タスクが存在するため削除できません",
  );
});

test("INVALID_FILE_NAME は専用文へ翻訳される", () => {
  const error = new TauriError("INVALID_FILE_NAME", "invalid file name: x");
  expect(buildMutationFailureMessage("create_task", error)).toBe(
    "タスクの作成に失敗しました: ファイル名が不正です（空・パス区切り文字・.md 以外の拡張子は使用できません）",
  );
});
