import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri/tauriError";
import { ProjectError } from "../../errors";
import { wasNotifiedByInvokeWrapped } from "..";

const tauriErrWithCommand = (command?: string): ProjectError =>
  ProjectError.tauri(new TauriError("IO_ERROR", "失敗", undefined, command));

test("allowlist 由来 tauri（command=update_task）は true", () => {
  expect(wasNotifiedByInvokeWrapped(tauriErrWithCommand("update_task"))).toBe(
    true,
  );
});

test.for([
  "update_card_order",
  "get_columns",
  "open_project",
] as const)("allowlist 外 tauri（command=%s）は false", (command) => {
  expect(wasNotifiedByInvokeWrapped(tauriErrWithCommand(command))).toBe(false);
});

test("command 未設定の tauri は false", () => {
  expect(wasNotifiedByInvokeWrapped(tauriErrWithCommand(undefined))).toBe(
    false,
  );
});

test("invalid-state（非 tauri）は false", () => {
  expect(wasNotifiedByInvokeWrapped(ProjectError.invalidState())).toBe(false);
});

test("partial-move（非 tauri）は false", () => {
  const underlying = new TauriError("IO_ERROR", "並び順保存に失敗");
  expect(wasNotifiedByInvokeWrapped(ProjectError.partialMove(underlying))).toBe(
    false,
  );
});
