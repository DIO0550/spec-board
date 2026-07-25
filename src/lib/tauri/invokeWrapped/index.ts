import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import {
  buildMutationFailureMessage,
  isMutationCommand,
} from "@/lib/tauri/mutationFailureMessage";
import { getToastSink } from "@/lib/tauri/toastSink";
import { Result, type Result as ResultT } from "@/utils/result";
import { TauriError } from "../tauriError";

/**
 * `invoke` を呼び、reject 値は `TauriError.from(e, cmd)` に正規化して `Result.err` に詰め直す。
 * 全 invoke ラッパでエラー正規化を一箇所に集約するための内部ヘルパ。
 *
 * 失敗時、書き込み系（allowlist）コマンドのみ登録済み sink へ失敗トーストを発火する。
 * 読み取り系は allowlist 外なので発火しない。sink 未登録時は no-op
 * （App マウント前など）で従来挙動を維持する。`Result.err` を返す契約は不変。
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
    // 起点コマンドを error に刻む。App 側の重複抑止判定で使う。
    const error = TauriError.from(e, cmd);
    // 書き込み系コマンドの失敗だけを共通トースト化する。
    if (isMutationCommand(cmd)) {
      const sink = getToastSink();
      // 未登録時は no-op（従来挙動を維持＝安全側のデフォルト）。
      if (sink !== null) {
        sink(buildMutationFailureMessage(cmd, error), "error");
      }
    }
    return Result.err(error);
  }
};
