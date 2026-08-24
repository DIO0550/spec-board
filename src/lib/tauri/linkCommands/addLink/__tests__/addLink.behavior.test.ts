import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { addLink } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskPayloadFixture: TaskPayload = {
  id: taskFilePathFixture("tasks/a.md"),
  title: "A",
  status: "Todo",
  labels: [],
  links: [taskFilePathFixture("tasks/b.md")],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: taskFilePathFixture("tasks/a.md"),
  extras: {},
  warnings: [],
};

const taskFixture = Task.fromPayload(taskPayloadFixture);

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'add_link' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await addLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("add_link");
});

test("引数 { sourceFilePath, targetFilePath } が args キー配下に camelCase のまま invoke に渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await addLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("add_link", {
    args: {
      sourceFilePath: taskFilePathFixture("tasks/a.md"),
      targetFilePath: taskFilePathFixture("tasks/b.md"),
    },
  });
});

test("成功時は Result.ok(Task) を返す（更新後の source Task）", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  const res = await addLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  expect(res).toEqual({ ok: true, value: taskFixture });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await addLink({
    sourceFilePath: taskFilePathFixture("tasks/a.md"),
    targetFilePath: taskFilePathFixture("tasks/b.md"),
  });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
