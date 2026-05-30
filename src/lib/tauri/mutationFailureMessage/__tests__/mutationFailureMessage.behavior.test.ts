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
  "add_link",
  "remove_link",
  "update_columns",
] as const)("allowlist の書き込み cmd '%s' で isMutationCommand が true", (cmd) => {
  expect(isMutationCommand(cmd)).toBe(true);
});

test.for([
  "get_tasks",
  "get_columns",
  "open_project",
  "update_card_order",
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

test("HAS_CHILDREN は専用文へ翻訳される", () => {
  const error = new TauriError("HAS_CHILDREN", "task has children");
  expect(buildMutationFailureMessage("delete_task", error)).toBe(
    "タスクの削除に失敗しました: 子タスクが存在するため削除できません",
  );
});
