import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import { TauriError } from "@/lib/tauri/tauriError";
import { registerToastSink, unregisterToastSink } from "@/lib/tauri/toastSink";
import type { Result as ResultT } from "@/utils/result";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const sink = vi.fn();

// Result.err を分岐なしで取り出す（テストの条件分岐禁止ルール準拠）。
const expectErr = <T, E>(result: ResultT<T, E>): E => {
  expect(result.ok).toBe(false);
  return (result as { ok: false; error: E }).error;
};

beforeEach(() => {
  invokeMock.mockReset();
  sink.mockReset();
  // モジュールスコープ sink を毎テスト実登録する。
  registerToastSink(sink);
});

// グローバル sink state が後続テストへリークしないよう必ず解除する。
afterEach(unregisterToastSink);

test("mutation reject 時に sink が操作別文言と error 種別で 1 回呼ばれる", async () => {
  invokeMock.mockRejectedValueOnce(new Error("書き込みに失敗しました"));
  const res = await invokeWrapped("create_task");
  expect(sink).toHaveBeenCalledTimes(1);
  expect(sink).toHaveBeenCalledWith(
    "タスクの作成に失敗しました: 書き込みに失敗しました",
    "error",
  );
  expect(res.ok).toBe(false);
});

test("reject でも throw せず Result.err(TauriError) を返す（既存契約）", async () => {
  invokeMock.mockRejectedValueOnce(new Error("boom"));
  const error = expectErr(await invokeWrapped("update_task"));
  expect(error).toBeInstanceOf(TauriError);
});

test("reject 時 error に起点コマンド名が刻まれる", async () => {
  invokeMock.mockRejectedValueOnce(new Error("boom"));
  const error = expectErr(await invokeWrapped<unknown>("create_task"));
  expect(error.command).toBe("create_task");
});

test("成功時は sink が呼ばれず Result.ok(value) を返す", async () => {
  invokeMock.mockResolvedValueOnce({ id: "x" });
  const res = await invokeWrapped("create_task");
  expect(sink).not.toHaveBeenCalled();
  expect(res).toEqual({ ok: true, value: { id: "x" } });
});

test.for([
  "get_tasks",
  "get_columns",
  "get_labels",
  "open_project",
] as const)("読み取り系 '%s' の reject では sink が発火しない", async (cmd) => {
  invokeMock.mockRejectedValueOnce(new Error("read boom"));
  const res = await invokeWrapped(cmd);
  expect(sink).not.toHaveBeenCalled();
  expect(res.ok).toBe(false);
});

test("move_task の reject では sink が発火する（書き込み allowlist）", async () => {
  invokeMock.mockRejectedValueOnce(new Error("move boom"));
  const res = await invokeWrapped("move_task");
  expect(sink).toHaveBeenCalledTimes(1);
  expect(sink.mock.calls[0]?.[0]).toContain("タスクの移動に失敗しました");
  expect(res.ok).toBe(false);
});

test("連続失敗では都度発火する（重複抑止しない＝既存仕様）", async () => {
  invokeMock.mockRejectedValue(new Error("書き込みに失敗しました"));
  await invokeWrapped("update_task");
  await invokeWrapped("update_task");
  expect(sink).toHaveBeenCalledTimes(2);
});

test("sink 未登録でも mutation reject は例外なく Result.err を返す（no-op）", async () => {
  unregisterToastSink();
  invokeMock.mockRejectedValueOnce(new Error("boom"));
  const res = await invokeWrapped("delete_task");
  expect(res.ok).toBe(false);
});
