import {
  buildMutationFailureMessage,
  type MutationCommand,
} from "@/lib/tauri/mutationFailureMessage";
import type { TauriError } from "@/lib/tauri/tauriError";
import { getToastSink } from "@/lib/tauri/toastSink";

/**
 * mutation失敗を登録済みtoast sinkへ通知する。sink未登録時はno-op。
 * @param command 失敗したmutation command
 * @param error 表示する正規化済みエラー
 * @returns なし
 */
export const notifyMutationFailure = (
  command: MutationCommand,
  error: TauriError,
): void => {
  const sink = getToastSink();
  if (sink === null) {
    return;
  }
  sink(buildMutationFailureMessage(command, error), "error");
};
