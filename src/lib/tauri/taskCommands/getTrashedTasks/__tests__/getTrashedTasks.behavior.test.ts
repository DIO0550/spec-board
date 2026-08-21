import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { getTrashedTasks } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_trashed_tasks' command を引数なしで呼ぶ", async () => {
  vi.mocked(invoke).mockResolvedValue({ tasks: [] });
  await getTrashedTasks();
  expect(vi.mocked(invoke)).toHaveBeenCalledWith(
    "get_trashed_tasks",
    undefined,
  );
});

test("成功時は payload をそのまま Result.ok で返す", async () => {
  const payload = {
    tasks: [
      {
        filePath: "tasks/x.md",
        title: "X",
        status: "Todo",
        deletedAt: "2026-08-19T00:00:00Z",
      },
    ],
  };
  vi.mocked(invoke).mockResolvedValue(payload);
  const result = await getTrashedTasks();
  expect(result).toEqual({ ok: true, value: payload });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const result = await getTrashedTasks();
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
