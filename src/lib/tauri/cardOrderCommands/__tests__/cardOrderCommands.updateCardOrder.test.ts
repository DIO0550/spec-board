import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { updateCardOrder } from "@/lib/tauri/cardOrderCommands";
import { TauriError } from "@/lib/tauri/tauriError";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'update_card_order' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateCardOrder({ columnName: "Todo", filePaths: ["tasks/a.md"] });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("update_card_order");
});

test("引数 { columnName, filePaths } が camelCase のまま invoke に渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateCardOrder({
    columnName: "Todo",
    filePaths: ["tasks/a.md", "tasks/b.md"],
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_card_order", {
    columnName: "Todo",
    filePaths: ["tasks/a.md", "tasks/b.md"],
  });
});

test("filePaths が空配列でもそのまま渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await updateCardOrder({ columnName: "Todo", filePaths: [] });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_card_order", {
    columnName: "Todo",
    filePaths: [],
  });
});

test("成功時は Result.ok(undefined) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await updateCardOrder({ columnName: "Todo", filePaths: [] });
  expect(res).toEqual({ ok: true, value: undefined });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await updateCardOrder({ columnName: "Todo", filePaths: [] });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
