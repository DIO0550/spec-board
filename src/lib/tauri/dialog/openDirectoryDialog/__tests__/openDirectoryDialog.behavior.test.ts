import { beforeEach, expect, test, vi } from "vitest";
import { openDirectoryDialog } from "..";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const { open } = await import("@tauri-apps/plugin-dialog");
const openMock = vi.mocked(open);

beforeEach(() => {
  openMock.mockReset();
});

test("ディレクトリ選択成功 → Result.ok(path)", async () => {
  openMock.mockResolvedValue("/path/to/project");
  const result = await openDirectoryDialog();
  expect(result).toEqual({ ok: true, value: "/path/to/project" });
  expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false });
});

test("キャンセル (open が null を返す) → Result.ok(null)", async () => {
  openMock.mockResolvedValue(null);
  const result = await openDirectoryDialog();
  expect(result).toEqual({ ok: true, value: null });
});

test("dialog plugin 例外 (Error) → Result.err(TauriError) で message 採用", async () => {
  openMock.mockRejectedValue(new Error("dialog failed"));
  const result = await openDirectoryDialog();
  expect(result.ok).toBe(false);
  expect(
    (result as { error: { message: string; name: string } }).error.message,
  ).toBe("dialog failed");
  expect((result as { error: { name: string } }).error.name).toBe("TauriError");
});
