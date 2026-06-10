import type { AppView } from "@/hooks/useAppView";

/** create 画面を閉じたときの戻り先。 */
export type CloseTarget = {
  /** 遷移先の view */
  view: AppView;
  /** 復元する選択タスク（detail 復帰時のみ非 null） */
  selectedTaskId: string | null;
};

/**
 * create 画面を閉じたときの戻り先を解決する純関数。
 * `returnView==="detail"` かつ `returnTaskId` があれば detail へ復帰して
 * selectedTaskId を復元する。それ以外は returnView へ素直に遷移する。
 * @param returnView - create 起動時に退避した直前の view
 * @param returnTaskId - create 起動時に退避した選択タスク（なければ null）
 * @returns 戻り先 view と復元する selectedTaskId
 */
export const resolveCloseTarget = (
  returnView: AppView,
  returnTaskId: string | null,
): CloseTarget => {
  if (returnView === "detail" && returnTaskId !== null) {
    return { view: "detail", selectedTaskId: returnTaskId };
  }
  return { view: returnView, selectedTaskId: null };
};
