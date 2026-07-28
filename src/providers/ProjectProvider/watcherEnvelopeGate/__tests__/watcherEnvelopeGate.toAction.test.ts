import { expect, test } from "vitest";
import { WatcherGate } from "../index";
import {
  diagnosticEnvelope,
  envelope,
  resyncEnvelope,
  taskPayload,
} from "./watcherGateFixtures";

test("task-created は task-created action になる", () => {
  const action = WatcherGate.toAction(
    envelope({
      payload: { kind: "task-created", task: taskPayload("tasks/a.md") },
    }),
  );

  expect(action).toMatchObject({
    type: "task-created",
    task: { filePath: "tasks/a.md" },
  });
});

test("task-updated は元の filePath を添えた task-updated action になる", () => {
  const action = WatcherGate.toAction(
    envelope({
      payload: { kind: "task-updated", task: taskPayload("tasks/b.md") },
    }),
  );

  expect(action).toMatchObject({
    type: "task-updated",
    originalFilePath: "tasks/b.md",
    task: { filePath: "tasks/b.md" },
  });
});

test("task-deleted は task-deleted action になる", () => {
  const action = WatcherGate.toAction(
    envelope({ payload: { kind: "task-deleted", filePath: "tasks/c.md" } }),
  );

  expect(action).toEqual({ type: "task-deleted", filePath: "tasks/c.md" });
});

test.each([
  ["resync-required", resyncEnvelope()],
  ["diagnostic", diagnosticEnvelope()],
])("%s は store へ流す action を持たない", (_label, target) => {
  expect(WatcherGate.toAction(target)).toBeNull();
});
