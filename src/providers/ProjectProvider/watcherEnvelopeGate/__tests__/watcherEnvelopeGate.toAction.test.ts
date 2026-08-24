import { expect, test } from "vitest";
import type { TaskPayload } from "@/types/task";
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
  ["task-created", "id", undefined],
  ["task-created", "id", 42],
  ["task-created", "filePath", undefined],
  ["task-created", "filePath", 42],
  ["task-updated", "id", undefined],
  ["task-updated", "id", 42],
  ["task-updated", "filePath", undefined],
  ["task-updated", "filePath", 42],
] as const)("%s の task.%s が %s なら actionへ変換しない", (kind, field, value) => {
  const malformedTask = {
    ...taskPayload("tasks/a.md"),
    [field]: value,
  } as unknown as TaskPayload;

  expect(
    WatcherGate.toAction(envelope({ payload: { kind, task: malformedTask } })),
  ).toBeNull();
});

test.each([
  ["resync-required", resyncEnvelope()],
  ["diagnostic", diagnosticEnvelope()],
])("%s は store へ流す action を持たない", (_label, target) => {
  expect(WatcherGate.toAction(target)).toBeNull();
});
