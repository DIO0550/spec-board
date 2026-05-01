import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { deleteTask } from "@/lib/tauri/deleteTask";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'delete_task' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await deleteTask({ filePath: "tasks/x.md" });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("delete_task");
});

test("filePath のみ渡した場合、invoke 引数に orphanStrategy キーが含まれない", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await deleteTask({ filePath: "tasks/x.md" });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect(Object.keys(args)).toEqual(["filePath"]);
});

test("orphanStrategy='abort' は camelCase キーで渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await deleteTask({ filePath: "tasks/x.md", orphanStrategy: "abort" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("delete_task", {
    filePath: "tasks/x.md",
    orphanStrategy: "abort",
  });
});

test("orphanStrategy: undefined の明示指定は undefined のまま渡る（ラッパで削らない）", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await deleteTask({ filePath: "tasks/x.md", orphanStrategy: undefined });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect("orphanStrategy" in args).toBe(true);
  expect(args.orphanStrategy).toBeUndefined();
});

test("成功時は Result.ok(undefined) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await deleteTask({ filePath: "tasks/x.md" });
  expect(res).toEqual({ ok: true, value: undefined });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await deleteTask({ filePath: "tasks/x.md" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
