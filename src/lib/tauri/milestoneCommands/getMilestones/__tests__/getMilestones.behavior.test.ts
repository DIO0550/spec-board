import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import type { GetMilestonesPayload } from "@/lib/tauri";
import { getMilestones } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const payloadFixture: GetMilestonesPayload = {
  milestones: [{ name: "v0.3", title: "v0.3 リリース" }, { name: "v0.4" }],
  usageCounts: { "v0.3": 2 },
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_milestones' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ milestones: [], usageCounts: {} });
  await getMilestones();
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("get_milestones");
});

test("成功時は milestones と usageCounts を透過して Result.ok で返す", async () => {
  vi.mocked(invoke).mockResolvedValue(payloadFixture);
  const res = await getMilestones();
  expect(res).toEqual({ ok: true, value: payloadFixture });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await getMilestones();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
