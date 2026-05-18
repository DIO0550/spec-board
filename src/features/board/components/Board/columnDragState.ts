import type { Reducer } from "react";

/** カラム DnD で使用する独自 MIME 型。タスク DnD と衝突しない固定 string。 */
export const COLUMN_DRAG_MIME_TYPE = "application/x-spec-board-column" as const;

/**
 * カラム DnD の最小 state。
 *
 * 初期実装では `hoverColumnName` を視覚反映に使わないが、将来 hover プレースホルダ
 * を導入する余地として reducer 内に保持する（dispatch されるが UI には未配線）。
 */
export type ColumnDragState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "dragging";
      readonly fromColumnName: string;
      readonly hoverColumnName: string | null;
    };

/** カラム DnD reducer の action union。 */
export type ColumnDragAction =
  | { readonly type: "start"; readonly fromColumnName: string }
  | { readonly type: "hover"; readonly hoverColumnName: string }
  | { readonly type: "end" };

const IDLE: ColumnDragState = { kind: "idle" };

/**
 * ColumnDragState reducer。idle → dragging（start）/ dragging → dragging（hover）/
 * dragging → idle（end）の遷移のみを許可し、それ以外は state を据え置く。
 *
 * @param state 現在の ColumnDragState
 * @param action 適用する ColumnDragAction
 * @returns 次の ColumnDragState
 */
const reducer: Reducer<ColumnDragState, ColumnDragAction> = (state, action) => {
  if (action.type === "start") {
    return {
      kind: "dragging",
      fromColumnName: action.fromColumnName,
      hoverColumnName: null,
    };
  }
  if (action.type === "end") {
    return IDLE;
  }
  if (state.kind === "dragging") {
    return {
      ...state,
      hoverColumnName: action.hoverColumnName,
    };
  }
  return state;
};

/** ColumnDragState の companion。 */
export const ColumnDragState = {
  /** idle の初期 state。 */
  initial: IDLE,
  reducer,
} as const;
