import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { createLabel } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'create_label' という command 名 + {args} payload で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await createLabel({ name: "needs-design", group: "status" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_label", {
    args: { name: "needs-design", group: "status" },
  });
});

test("成功時は Result.ok(undefined) を返し value まで透過される", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await createLabel({ name: "needs-design" });
  expect(res).toEqual({ ok: true, value: undefined });
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await createLabel({ name: "needs-design" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
