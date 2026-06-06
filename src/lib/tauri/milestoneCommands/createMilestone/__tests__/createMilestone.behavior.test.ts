import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { createMilestone } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'create_milestone' という command 名 + {args} payload で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await createMilestone({ name: "v0.3", title: "v0.3 リリース" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_milestone", {
    args: { name: "v0.3", title: "v0.3 リリース" },
  });
});

test("成功時は Result.ok を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await createMilestone({ name: "v0.3" });
  expect(res.ok).toBe(true);
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await createMilestone({ name: "v0.3" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
