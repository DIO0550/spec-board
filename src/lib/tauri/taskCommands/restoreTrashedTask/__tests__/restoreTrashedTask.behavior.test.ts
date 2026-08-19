import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { restoreTrashedTask } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'restore_trashed_task' command に args キーで params を渡す", async () => {
  vi.mocked(invoke).mockResolvedValue({ restoredFilePath: "tasks/x.md" });
  await restoreTrashedTask({ filePath: "tasks/x.md" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("restore_trashed_task", {
    args: { filePath: "tasks/x.md" },
  });
});

test("成功時は payload をそのまま Result.ok で返す", async () => {
  vi.mocked(invoke).mockResolvedValue({ restoredFilePath: "tasks/x-2.md" });
  const result = await restoreTrashedTask({ filePath: "tasks/x.md" });
  expect(result).toEqual({
    ok: true,
    value: { restoredFilePath: "tasks/x-2.md" },
  });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const result = await restoreTrashedTask({ filePath: "tasks/x.md" });
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
