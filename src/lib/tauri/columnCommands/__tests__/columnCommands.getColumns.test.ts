import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { getColumns } from "@/lib/tauri/columnCommands";
import { TauriError } from "@/lib/tauri/tauriError";
import type { Column } from "@/types/column";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const columnsFixture: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_columns' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ columns: [], doneColumn: "" });
  await getColumns();
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("get_columns");
});

test("invoke 第 2 引数（payload）は undefined で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ columns: [], doneColumn: "" });
  await getColumns();
  expect(vi.mocked(invoke).mock.calls[0]?.[1]).toBeUndefined();
});

test("成功時は Result.ok({columns, doneColumn}) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue({
    columns: columnsFixture,
    doneColumn: "Done",
  });
  const res = await getColumns();
  expect(res).toEqual({
    ok: true,
    value: { columns: columnsFixture, doneColumn: "Done" },
  });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await getColumns();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
