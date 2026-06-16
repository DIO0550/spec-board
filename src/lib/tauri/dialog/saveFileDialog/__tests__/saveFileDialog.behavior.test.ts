import { save } from "@tauri-apps/plugin-dialog";
import { beforeEach, expect, test, vi } from "vitest";
import { saveFileDialog } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

beforeEach(() => {
  vi.mocked(save).mockReset();
});

test("保存先が選ばれた場合は Result.ok(path) を返す", async () => {
  vi.mocked(save).mockResolvedValue("/tmp/labels.yml");
  const res = await saveFileDialog({
    defaultPath: "labels.yml",
    filters: [{ name: "YAML", extensions: ["yml", "yaml"] }],
  });
  expect(res).toEqual({ ok: true, value: "/tmp/labels.yml" });
});

test("キャンセル時は Result.ok(null) を返す", async () => {
  vi.mocked(save).mockResolvedValue(null);
  const res = await saveFileDialog();
  expect(res).toEqual({ ok: true, value: null });
});

test("save() が例外を投げると Result.err(TauriError) を返す", async () => {
  vi.mocked(save).mockRejectedValue(new Error("dialog plugin failure"));
  const res = await saveFileDialog();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});

test("オプション無し呼び出しは defaultPath/filters undefined で save() へ透過される", async () => {
  vi.mocked(save).mockResolvedValue(null);
  await saveFileDialog();
  expect(save).toHaveBeenCalledWith({
    defaultPath: undefined,
    filters: undefined,
  });
});
