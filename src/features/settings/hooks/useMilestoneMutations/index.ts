import { useCallback } from "react";
import {
  type CreateMilestoneArgs,
  createMilestone,
  type DeleteMilestonePayload,
  deleteMilestone,
  type UpdateMilestoneArgs,
  updateMilestone,
} from "@/lib/tauri";

/** マイルストーン一覧を再取得する関数（`useMilestones.reload`）。 */
export type ReloadMilestones = () => Promise<void>;

/** useMilestoneMutations の返り値。create / update / delete を提供する。 */
export type UseMilestoneMutationsResult = {
  /**
   * マイルストーンを作成する。成功時のみ reload を呼ぶ。
   * @param args - 作成内容
   * @returns 成功なら true、失敗なら false（失敗トーストは共通層が発火する）
   */
  create: (args: CreateMilestoneArgs) => Promise<boolean>;
  /**
   * マイルストーンを更新する（PUT）。成功時のみ reload を呼ぶ。
   * @param args - 更新内容
   * @returns 成功なら true、失敗なら false
   */
  update: (args: UpdateMilestoneArgs) => Promise<boolean>;
  /**
   * マイルストーンを削除する。成功時のみ reload を呼ぶ。
   * @param name - 削除対象の name
   * @returns 成功なら削除前 usageCount を含む payload、失敗なら null
   */
  remove: (name: string) => Promise<DeleteMilestonePayload | null>;
};

/**
 * マイルストーン CRUD の mutation フック。**楽観更新は行わず**、成功時に `reload` を
 * 呼んで一覧を再取得・確定する（取得・一覧 state は持たない）。失敗時は共通層
 * （invokeWrapped allowlist）が失敗トーストを発火するため、ここでは reload を呼ばない。
 *
 * @param reload - 成功後に呼ぶ再取得関数（`useMilestones.reload`）
 * @returns create / update / remove
 */
export const useMilestoneMutations = (
  reload: ReloadMilestones,
): UseMilestoneMutationsResult => {
  /**
   * 作成。成功時のみ reload する。
   * @param args - 作成内容
   * @returns 成功なら true
   */
  const create = useCallback(
    async (args: CreateMilestoneArgs): Promise<boolean> => {
      const result = await createMilestone(args);
      if (!result.ok) {
        return false;
      }
      await reload();
      return true;
    },
    [reload],
  );

  /**
   * 更新。成功時のみ reload する。
   * @param args - 更新内容
   * @returns 成功なら true
   */
  const update = useCallback(
    async (args: UpdateMilestoneArgs): Promise<boolean> => {
      const result = await updateMilestone(args);
      if (!result.ok) {
        return false;
      }
      await reload();
      return true;
    },
    [reload],
  );

  /**
   * 削除。成功時のみ reload する。
   * @param name - 削除対象の name
   * @returns 成功なら usageCount payload、失敗なら null
   */
  const remove = useCallback(
    async (name: string): Promise<DeleteMilestonePayload | null> => {
      const result = await deleteMilestone(name);
      if (!result.ok) {
        return null;
      }
      await reload();
      return result.value;
    },
    [reload],
  );

  return { create, update, remove };
};
