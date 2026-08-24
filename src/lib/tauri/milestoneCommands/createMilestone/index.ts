import { invokeWrapped } from "@/lib/tauri/invokeWrapped";
import type { TauriError } from "@/lib/tauri/tauriError";
import type { Result } from "@/utils/result";
import type { CreateMilestoneArgs } from "../types";
import { validateMilestoneOrder } from "../validateMilestoneOrder";

/**
 * 新しいマイルストーンを milestones.yml に追記する。
 * 失敗時は書き込み失敗トースト（mutation 通知）の対象。
 * @param args 作成するマイルストーンの属性
 * @returns 成功時は Result.ok(undefined)、失敗時は Result.err(TauriError)
 */
export const createMilestone = (
  args: CreateMilestoneArgs,
): Promise<Result<void, TauriError>> => {
  const validation = validateMilestoneOrder(args.order, "create_milestone");
  if (!validation.ok) {
    return Promise.resolve(validation);
  }
  return invokeWrapped<void>("create_milestone", { args });
};
