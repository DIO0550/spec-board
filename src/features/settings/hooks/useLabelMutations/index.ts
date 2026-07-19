import { useCallback, useRef, useState } from "react";
import type { LabelName, LabelUpdateArgs } from "@/domains/label-definition";
import {
  type CreateLabelArgs,
  createLabel,
  type DeleteLabelPayload,
  deleteLabel,
  updateLabel,
} from "@/lib/tauri";

/** ラベル一覧を再取得する関数（`useLabels.reload`）。 */
export type ReloadLabels = () => Promise<void>;

/** useLabelMutations の返り値。create / update / delete を提供する。 */
export type UseLabelMutationsResult = {
  /**
   * いずれかの mutation が実行中か。送信ボタン等の disabled に使う。
   * pending 中に呼ばれた mutation は短絡して即失敗値を返す。
   */
  isPending: boolean;
  /**
   * ラベルを作成する。成功時のみ reload を呼ぶ。
   * @param args - 作成内容
   * @returns 成功なら true、失敗・pending 中なら false（失敗トーストは共通層が発火する）
   */
  create: (args: CreateLabelArgs) => Promise<boolean>;
  /**
   * ラベルを更新する（PUT）。成功時のみ reload を呼ぶ。
   * @param args - 更新内容
   * @returns 成功なら true、失敗・pending 中なら false
   */
  update: (args: LabelUpdateArgs) => Promise<boolean>;
  /**
   * ラベルを削除する。成功時のみ reload を呼ぶ。
   * @param name - 削除対象の name
   * @returns 成功なら削除前 usageCount を含む payload、失敗・pending 中なら null
   */
  remove: (name: LabelName) => Promise<DeleteLabelPayload | null>;
};

/**
 * ラベル CRUD の mutation フック。**楽観更新は行わず**、成功時に `reload` を呼んで
 * 一覧を再取得・確定する（取得・一覧 state は持たない）。失敗時は共通層
 * （invokeWrapped allowlist）が失敗トーストを発火するため、ここでは reload を呼ばない。
 *
 * 実行中の再呼び出しは hook 内の in-flight ガードで短絡する。3 種の mutation は同じ
 * 一覧 state を共有して reload で確定するため、ガードは種別をまたいで 1 本に統一し、
 * いずれかが実行中なら他種別も短絡させる（create 連打の重複作成・remove の二重失敗
 * トーストを防ぐ）。`isPending`（state）は描画追従用、ref は同一 tick の連打でも
 * 確実に短絡させるための同期判定用として併用する。
 *
 * @param reload - 成功後に呼ぶ再取得関数（`useLabels.reload`）
 * @returns isPending / create / update / remove
 */
export const useLabelMutations = (
  reload: ReloadLabels,
): UseLabelMutationsResult => {
  const [isPending, setIsPending] = useState(false);
  // state 反映を待たずに同期判定するための in-flight フラグ（種別共通）。
  const inFlightRef = useRef(false);

  /**
   * mutation を in-flight ガードで包む。pending 中なら `rejected` を即返し、
   * そうでなければ `run` を実行して結果を返す。成否に関わらず finally で解放する。
   * @param run - 実行する mutation 本体
   * @param rejected - pending 中の短絡時に返す値
   * @returns run の結果、または pending 中なら rejected
   */
  const guard = useCallback(
    async <T>(run: () => Promise<T>, rejected: T): Promise<T> => {
      if (inFlightRef.current) {
        return rejected;
      }
      inFlightRef.current = true;
      setIsPending(true);
      try {
        return await run();
      } finally {
        inFlightRef.current = false;
        setIsPending(false);
      }
    },
    [],
  );

  /**
   * 作成。成功時のみ reload する。
   * @param args - 作成内容
   * @returns 成功なら true、失敗・pending 中なら false
   */
  const create = useCallback(
    (args: CreateLabelArgs): Promise<boolean> =>
      guard(async () => {
        const result = await createLabel(args);
        if (!result.ok) {
          return false;
        }
        await reload();
        return true;
      }, false),
    [guard, reload],
  );

  /**
   * 更新。成功時のみ reload する。
   * @param args - 更新内容
   * @returns 成功なら true、失敗・pending 中なら false
   */
  const update = useCallback(
    (args: LabelUpdateArgs): Promise<boolean> =>
      guard(async () => {
        const result = await updateLabel(args);
        if (!result.ok) {
          return false;
        }
        await reload();
        return true;
      }, false),
    [guard, reload],
  );

  /**
   * 削除。成功時のみ reload する。
   * @param name - 削除対象の name
   * @returns 成功なら usageCount payload、失敗・pending 中なら null
   */
  const remove = useCallback(
    (name: LabelName): Promise<DeleteLabelPayload | null> =>
      guard<DeleteLabelPayload | null>(async () => {
        const result = await deleteLabel(name);
        if (!result.ok) {
          return null;
        }
        await reload();
        return result.value;
      }, null),
    [guard, reload],
  );

  return { isPending, create, update, remove };
};
