import { Milestone } from "@/domains/milestone";
import type { MutationCommand } from "@/lib/tauri/mutationFailureMessage";
import { notifyMutationFailure } from "@/lib/tauri/notifyMutationFailure";
import { TauriError } from "@/lib/tauri/tauriError";
import { Result, type Result as ResultT } from "@/utils/result";

const INVALID_ORDER_MESSAGE = `order は0以上${Milestone.MAX_ORDER}以下の整数で指定してください`;

type MilestoneMutationCommand = Extract<
  MutationCommand,
  "create_milestone" | "update_milestone"
>;

/**
 * milestone CRUDのorderをinvoke前に検証し、失敗時は既存mutation通知契約も満たす。
 * @param order 検証するorder。undefinedは未指定として受理する
 * @param command 起点のmilestone mutation command
 * @returns 有効ならResult.ok、無効なら通知済みのResult.err
 */
export const validateMilestoneOrder = (
  order: number | undefined,
  command: MilestoneMutationCommand,
): ResultT<void, TauriError> => {
  if (order === undefined || Milestone.isValidOrder(order)) {
    return Result.ok(undefined);
  }
  const error = new TauriError(
    "INVALID_ARGUMENT",
    INVALID_ORDER_MESSAGE,
    order,
    command,
  );
  notifyMutationFailure(command, error);
  return Result.err(error);
};
