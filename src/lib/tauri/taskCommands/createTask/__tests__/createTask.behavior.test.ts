import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { createTask } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskPayloadFixture: TaskPayload = {
  id: "1",
  title: "T",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/x.md",
};

const taskFixture = Task.fromPayload(taskPayloadFixture);

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'create_task' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await createTask({ title: "T", status: "Todo" });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("create_task");
});

test("必須フィールドのみ指定時は invoke 引数に title / status のみが含まれる", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await createTask({ title: "T", status: "Todo" });
  const args = vi.mocked(invoke).mock.calls[0]?.[1];
  expect(args).toEqual({ title: "T", status: "Todo" });
  expect(Object.keys(args ?? {})).toEqual(["title", "status"]);
});

test("任意フィールドが全指定された場合 camelCase のまま invoke 引数に反映される", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await createTask({
    title: "T",
    status: "Todo",
    priority: "High",
    labels: ["a"],
    parent: "tasks/p.md",
    body: "本文",
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_task", {
    title: "T",
    status: "Todo",
    priority: "High",
    labels: ["a"],
    parent: "tasks/p.md",
    body: "本文",
  });
});

test("optional に undefined を明示指定した場合 undefined のまま渡る（ラッパで加工しない）", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await createTask({
    title: "T",
    status: "Todo",
    priority: undefined,
  });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect("priority" in args).toBe(true);
  expect(args.priority).toBeUndefined();
});

test("成功時は Result.ok(Task) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  const res = await createTask({ title: "T", status: "Todo" });
  expect(res).toEqual({ ok: true, value: taskFixture });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await createTask({ title: "T", status: "Todo" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
