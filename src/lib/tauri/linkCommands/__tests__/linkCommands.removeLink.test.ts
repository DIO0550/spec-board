import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { removeLink } from "@/lib/tauri/linkCommands";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'remove_link' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await removeLink({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("remove_link");
});

test("引数 { sourceFilePath, targetFilePath } が camelCase のまま invoke に渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await removeLink({
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("remove_link", {
    sourceFilePath: "tasks/a.md",
    targetFilePath: "tasks/b.md",
  });
});

test("成功時は Result.ok(undefined) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await removeLink({ sourceFilePath: "a", targetFilePath: "b" });
  expect(res).toEqual({ ok: true, value: undefined });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await removeLink({ sourceFilePath: "a", targetFilePath: "b" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
