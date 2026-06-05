import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { deleteMilestone } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'delete_milestone' という command 名 + {args:{name}} payload で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ usageCount: 0 });
  await deleteMilestone("v0.3");
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_milestone", {
    args: { name: "v0.3" },
  });
});

test("成功時は usageCount を Result.ok で返す", async () => {
  vi.mocked(invoke).mockResolvedValue({ usageCount: 3 });
  const res = await deleteMilestone("v0.3");
  expect(res).toEqual({ ok: true, value: { usageCount: 3 } });
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await deleteMilestone("v0.3");
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
