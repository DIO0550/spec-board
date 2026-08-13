import { expect, test } from "vitest";
import { TauriError } from "@/lib/tauri";
import {
  isProjectSwitchedError,
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
} from "@/providers/ProjectProvider";

test("project switch を示す invalid-state だけを true と判定する", () => {
  expect(
    isProjectSwitchedError(ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE)),
  ).toBe(true);
});

test.each([
  ProjectError.invalidState("通常の状態エラー"),
  ProjectError.tauri(new TauriError("UNKNOWN", PROJECT_SWITCHED_MESSAGE)),
])("project switch 以外の ProjectError は false と判定する", (error) => {
  expect(isProjectSwitchedError(error)).toBe(false);
});
