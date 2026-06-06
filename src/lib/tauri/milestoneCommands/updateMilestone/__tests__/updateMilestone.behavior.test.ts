import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { updateMilestone } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'update_milestone' という command 名 + {args} payload で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateMilestone({ name: "v0.3", state: "closed" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_milestone", {
    args: { name: "v0.3", state: "closed" },
  });
});

test("成功時は Result.ok を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await updateMilestone({ name: "v0.3" });
  expect(res.ok).toBe(true);
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await updateMilestone({ name: "v0.3" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
