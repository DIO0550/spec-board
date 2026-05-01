import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { getTasks } from "@/lib/tauri/getTasks";
import { TauriError } from "@/lib/tauri/tauriError";
import type { Task } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskFixture: Task = {
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

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_tasks' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue([]);
  await getTasks();
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("get_tasks");
});

test("invoke は引数なし（command 名のみ、第 2 引数なし）で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue([]);
  await getTasks();
  expect(vi.mocked(invoke).mock.calls[0]).toEqual(["get_tasks"]);
});

test("成功時は Result.ok(Task[]) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue([taskFixture]);
  const res = await getTasks();
  expect(res).toEqual({ ok: true, value: [taskFixture] });
});

test("invoke が reject すると throw せず Result.err を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  await expect(getTasks()).resolves.toMatchObject({ ok: false });
});

test("reject 時の error は TauriError インスタンス", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await getTasks();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
