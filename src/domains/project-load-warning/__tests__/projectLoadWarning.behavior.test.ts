import { expect, test } from "vitest";
import {
  ProjectLoadWarning,
  type ProjectLoadWarningPayloadInput,
} from "@/domains/project-load-warning";

const payload = (
  overrides: Partial<ProjectLoadWarningPayloadInput> = {},
): ProjectLoadWarningPayloadInput => ({
  code: "binaryFile",
  stage: "scan",
  path: "tasks/a.md",
  message: "binary file",
  recoverable: true,
  ...overrides,
});

test("fromPayload は既知の code / stage と nullable path を保持する", () => {
  expect(
    ProjectLoadWarning.fromPayload(
      payload({ code: "configFallback", stage: "config", path: null }),
    ),
  ).toEqual({
    code: "configFallback",
    stage: "config",
    path: null,
    message: "binary file",
    recoverable: true,
  });
});

test("fromPayload は未知の code / stage を unknown に丸める", () => {
  expect(
    ProjectLoadWarning.fromPayload(
      payload({ code: "futureCode", stage: "futureStage" }),
    ),
  ).toMatchObject({ code: "unknown", stage: "unknown" });
});

test("fingerprint は順序に依存せず、内容の変更を区別する", () => {
  const first = ProjectLoadWarning.fromPayload(payload());
  const second = ProjectLoadWarning.fromPayload(
    payload({ code: "unreadableFile", message: "permission denied" }),
  );

  expect(ProjectLoadWarning.fingerprint([first, second])).toBe(
    ProjectLoadWarning.fingerprint([second, first]),
  );
  expect(ProjectLoadWarning.fingerprint([first])).not.toBe(
    ProjectLoadWarning.fingerprint([second]),
  );
  expect(ProjectLoadWarning.fingerprint([])).toBe("[]");
});
