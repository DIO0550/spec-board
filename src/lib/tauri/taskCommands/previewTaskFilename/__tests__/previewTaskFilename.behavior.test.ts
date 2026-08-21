import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { previewTaskFilename } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import type { PreviewTaskFilenameParams } from "../../types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const PARAMS: PreviewTaskFilenameParams = {
  title: "My Task",
  explicitFilename: "custom-name.md",
  parentFilePath: "tasks/parent.md",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'preview_task_filename' command に args キーで params を渡す", async () => {
  vi.mocked(invoke).mockResolvedValue({ kind: "pending" });
  await previewTaskFilename(PARAMS);
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("preview_task_filename", {
    args: PARAMS,
  });
});

test("成功時は payload をそのまま Result.ok で返す", async () => {
  const payload = {
    kind: "path",
    fileName: "my-task.md",
    relPath: "tasks/my-task.md",
    fullPath: "/project/tasks/my-task.md",
  };
  vi.mocked(invoke).mockResolvedValue(payload);
  const result = await previewTaskFilename(PARAMS);
  expect(result).toEqual({ ok: true, value: payload });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const result = await previewTaskFilename(PARAMS);
  expect(result.ok).toBe(false);
  expect((result as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
