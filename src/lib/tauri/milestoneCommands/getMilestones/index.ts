import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { GetMilestonesPayload } from "../types";

/**
 * 現在のプロジェクトのマイルストーンマスタ定義一覧と使用数を取得する。
 * milestones.yml 不在時は空配列。読み取り系 command のため失敗時に
 * 書き込み失敗トースト（mutation 通知）の対象にはしない。
 * @returns 成功時は Result.ok({milestones, usageCounts})、失敗時は Result.err(TauriError)
 */
export const getMilestones = (): Promise<
  Result<GetMilestonesPayload, TauriError>
> => invokeWrapped<GetMilestonesPayload>("get_milestones");
