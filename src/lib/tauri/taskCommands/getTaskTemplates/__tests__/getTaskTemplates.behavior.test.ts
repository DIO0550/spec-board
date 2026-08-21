import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { getTaskTemplates } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_task_templates' という command 名を引数なしで呼ぶ", async () => {
  vi.mocked(invoke).mockResolvedValue({ templates: [] });
  await getTaskTemplates();
  expect(vi.mocked(invoke)).toHaveBeenCalledWith(
    "get_task_templates",
    undefined,
  );
});

test("成功時は payload をそのまま Result.ok で返す", async () => {
  const payload = {
    templates: [
      {
        name: "bug",
        title: "バグ報告",
        labels: ["bug"],
        links: [],
        draft: false,
        body: "## 再現手順",
      },
    ],
  };
  vi.mocked(invoke).mockResolvedValue(payload);
  const result = await getTaskTemplates();
  expect(result).toEqual({ ok: true, value: payload });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const result = await getTaskTemplates();
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
