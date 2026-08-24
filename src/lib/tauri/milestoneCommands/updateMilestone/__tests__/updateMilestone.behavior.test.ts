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

test("orderの上限値はinvokeへ渡される", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateMilestone({ name: "v0.3", order: 4_294_967_295 });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_milestone", {
    args: { name: "v0.3", order: 4_294_967_295 },
  });
});

test("不正なorderはinvokeせずINVALID_ARGUMENTを返す", async () => {
  const result = await updateMilestone({ name: "v0.3", order: -1 });
  expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    ok: false,
    error: {
      code: "INVALID_ARGUMENT",
      cause: -1,
      command: "update_milestone",
    },
  });
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await updateMilestone({ name: "v0.3" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
