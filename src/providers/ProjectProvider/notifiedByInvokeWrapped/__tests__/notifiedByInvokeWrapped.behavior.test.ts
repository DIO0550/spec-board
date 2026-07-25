import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri/tauriError";
import { ProjectError } from "../../errors";
import { wasNotifiedByInvokeWrapped } from "..";

const tauriErrWithCommand = (command?: string): ProjectError =>
  ProjectError.tauri(new TauriError("IO_ERROR", "失敗", undefined, command));

test.for([
  "update_task",
  "move_task",
] as const)("allowlist 由来 tauri（command=%s）は true", (command) => {
  expect(wasNotifiedByInvokeWrapped(tauriErrWithCommand(command))).toBe(true);
});

test.for([
  "get_tasks",
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
