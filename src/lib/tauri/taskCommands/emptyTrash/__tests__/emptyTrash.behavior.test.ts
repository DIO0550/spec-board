import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { emptyTrash } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'empty_trash' command を引数なしで呼ぶ", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await emptyTrash();
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("empty_trash", undefined);
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const result = await emptyTrash();
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
