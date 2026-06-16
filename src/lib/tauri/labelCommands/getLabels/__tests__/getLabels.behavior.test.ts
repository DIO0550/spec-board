import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import type { LabelDefinition } from "@/lib/tauri";
import { getLabels } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const labelsFixture: LabelDefinition[] = [
  { name: "bug", description: "バグ報告", group: "type", color: "#D73A4A" },
  { name: "enhancement" },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_labels' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ labels: [], usageCounts: {} });
  await getLabels();
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("get_labels");
});

test("invoke 第 2 引数（payload）は undefined で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ labels: [], usageCounts: {} });
  await getLabels();
  expect(vi.mocked(invoke).mock.calls[0]?.[1]).toBeUndefined();
});

test("成功時は Result.ok({labels, usageCounts}) を返し定義順を保持する", async () => {
  const usageCounts = { bug: 8 };
  vi.mocked(invoke).mockResolvedValue({
    labels: labelsFixture,
    usageCounts,
  });
  const res = await getLabels();
  // labels.yml 定義順（bug → enhancement）がそのまま payload に保持される
  expect(res).toEqual({
    ok: true,
    value: {
      labels: [{ ...labelsFixture[0] }, { ...labelsFixture[1] }],
      usageCounts,
    },
  });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await getLabels();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
