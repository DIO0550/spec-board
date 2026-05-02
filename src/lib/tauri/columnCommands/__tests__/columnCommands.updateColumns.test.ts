import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { updateColumns } from "@/lib/tauri/columnCommands";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'update_columns' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateColumns({});
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("update_columns");
});

test("空オブジェクト {} を渡しても invoke は呼ばれ、第 2 引数も {} になる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateColumns({});
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_columns", {});
});

test("columns / doneColumn / renames を全指定すると camelCase キーのまま渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateColumns({
    columns: [{ name: "Todo", order: 0 }],
    doneColumn: "Done",
    renames: [{ from: "InProg", to: "Doing" }],
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_columns", {
    columns: [{ name: "Todo", order: 0 }],
    doneColumn: "Done",
    renames: [{ from: "InProg", to: "Doing" }],
  });
});

test("optional に undefined を明示指定した場合 undefined のまま渡る（ラッパで加工しない）", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateColumns({ columns: undefined, doneColumn: undefined });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect("columns" in args).toBe(true);
  expect("doneColumn" in args).toBe(true);
  expect(args.columns).toBeUndefined();
  expect(args.doneColumn).toBeUndefined();
});

test("成功時は Result.ok(undefined) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await updateColumns({});
  expect(res).toEqual({ ok: true, value: undefined });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await updateColumns({});
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
