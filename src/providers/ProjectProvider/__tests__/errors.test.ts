import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri";
import {
  isProjectSwitchedError,
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
  type ProjectInvalidStateReason,
} from "@/providers/ProjectProvider";

test("invalidStateの既定messageはnot-loadedとして分類される", () => {
  expect(ProjectError.invalidState()).toEqual({
    kind: "invalid-state",
    reason: "not-loaded",
    message: "プロジェクトが開かれていません",
  });
});

test("invalidStateのcustom messageはoperation-rejectedとして分類される", () => {
  expect(ProjectError.invalidState("通常の状態エラー")).toEqual({
    kind: "invalid-state",
    reason: "operation-rejected",
    message: "通常の状態エラー",
  });
});

test("projectSwitchedは専用reasonと既定表示messageを組み合わせる", () => {
  expect(ProjectError.projectSwitched()).toEqual({
    kind: "invalid-state",
    reason: "project-switched",
    message: PROJECT_SWITCHED_MESSAGE,
  });
});

test("同じ表示messageのoperation-rejectedはproject switchと判定しない", () => {
  expect(
    isProjectSwitchedError(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE)),
  ).toBe(false);
});

test.each([
  ProjectError.invalidState("通常の状態エラー"),
  ProjectError.tauri(new TauriError("UNKNOWN", PROJECT_SWITCHED_MESSAGE)),
])("project switch 以外の ProjectError は false と判定する", (error) => {
  expect(isProjectSwitchedError(error)).toBe(false);
});

test("project-switched reasonなら表示messageに依存せずtrueと判定する", () => {
  const reason: ProjectInvalidStateReason = "project-switched";
  const error = {
    kind: "invalid-state" as const,
    reason,
    message: "表示文言が変更された場合",
  };
  expect(isProjectSwitchedError(error)).toBe(true);
});
