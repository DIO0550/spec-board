import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import { Result, type Result as ResultT } from "@/lib/result";
import { TauriError } from "./tauriError";

/**
 * `invoke` を呼び、reject 値は `TauriError.from(e)` に正規化して `Result.err` に詰め直す。
 * 全 invoke ラッパでエラー正規化を一箇所に集約するための内部ヘルパ。
 *
 * 第 2 引数を渡さなかった場合は `invoke(cmd)` を引数 1 つだけで呼ぶ。
 * 渡した場合（`undefined` の明示指定を含む）は `invoke(cmd, args)` で素通しする。
 *
 * @param args 可変長: `[cmd]` または `[cmd, args]`
 * @returns 成功時は Result.ok(value)、失敗時は Result.err(TauriError)
 */
export const invokeWrapped = async <T>(
  ...args: [cmd: string] | [cmd: string, args: InvokeArgs | undefined]
): Promise<ResultT<T, TauriError>> => {
  try {
    const value =
      args.length === 1
        ? await invoke<T>(args[0])
        : await invoke<T>(args[0], args[1]);
    return Result.ok(value);
  } catch (e) {
    return Result.err(TauriError.from(e));
  }
};
