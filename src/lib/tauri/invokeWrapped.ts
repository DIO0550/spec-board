import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import { Result, type Result as ResultT } from "@/utils/result";
import { TauriError } from "./tauriError";

/**
 * `invoke` を呼び、reject 値は `TauriError.from(e)` に正規化して `Result.err` に詰め直す。
 * 全 invoke ラッパでエラー正規化を一箇所に集約するための内部ヘルパ。
 *
 * `args` を省略した場合は `invoke(cmd, undefined)` 相当として呼ぶ（Tauri 側で無視される）。
 *
 * @param cmd Tauri コマンド名 (snake_case)
 * @param args 引数オブジェクト。省略可
 * @returns 成功時は Result.ok(value)、失敗時は Result.err(TauriError)
 */
export const invokeWrapped = async <T>(
  cmd: string,
  args?: InvokeArgs,
): Promise<ResultT<T, TauriError>> => {
  try {
    const value = await invoke<T>(cmd, args);
    return Result.ok(value);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
