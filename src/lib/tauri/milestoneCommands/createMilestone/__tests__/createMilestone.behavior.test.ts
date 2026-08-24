import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMilestone } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { registerToastSink, unregisterToastSink } from "@/lib/tauri/toastSink";
import type { Result } from "@/utils/result";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const sink = vi.fn();

/**
 * Result.errからTauriErrorを取り出す。
 * @param result 検証対象のResult
 * @returns Result.errが保持するTauriError
 */
const expectError = (result: Result<void, TauriError>): TauriError => {
  expect(result.ok).toBe(false);
  return (result as { readonly ok: false; readonly error: TauriError }).error;
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  sink.mockReset();
  registerToastSink(sink);
});

afterEach(unregisterToastSink);

test("invoke が 'create_milestone' という command 名 + {args} payload で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await createMilestone({ name: "v0.3", title: "v0.3 リリース" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_milestone", {
    args: { name: "v0.3", title: "v0.3 リリース" },
  });
});

test("成功時は Result.ok を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  const res = await createMilestone({ name: "v0.3" });
  expect(res.ok).toBe(true);
});

test.each([
  undefined,
  0,
  4_294_967_295,
])("order=%s はinvokeへ渡される", async (order) => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await createMilestone({ name: "v0.3", order });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("create_milestone", {
    args: { name: "v0.3", order },
  });
  expect(sink).not.toHaveBeenCalled();
});

test.each([
  4_294_967_296,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
])("不正なorder=%sはinvokeせずINVALID_ARGUMENTを通知する", async (order) => {
  const error = expectError(await createMilestone({ name: "v0.3", order }));
  expect(vi.mocked(invoke)).not.toHaveBeenCalled();
  expect(error).toMatchObject({
    code: "INVALID_ARGUMENT",
    message: "order は0以上4294967295以下の整数で指定してください",
    cause: order,
    command: "create_milestone",
  });
  expect(sink).toHaveBeenCalledTimes(1);
  expect(sink).toHaveBeenCalledWith(
    "マイルストーンの作成に失敗しました: order は0以上4294967295以下の整数で指定してください",
    "error",
  );
});

test("invoke が reject すると Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await createMilestone({ name: "v0.3" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
