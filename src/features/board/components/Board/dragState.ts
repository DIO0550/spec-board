import type { Reducer } from "react";

/** ドラッグ開始 action。 */
export type DragActionStart = {
  readonly type: "start";
  readonly taskFilePath: string;
  readonly fromColumn: string;
};

/** dragover による hover 位置更新 action。 */
export type DragActionHover = {
  readonly type: "hover";
  readonly column: string | null;
  readonly index: number | null;
};

/** ドラッグ終了 / drop 完了 action。 */
export type DragActionEnd = {
  readonly type: "end";
};

/** DragAction の discriminated union（reducer の入力型）。 */
export type DragAction = DragActionStart | DragActionHover | DragActionEnd;

/**
 * ドラッグ中のローカル UI 状態。
 * Project state には載せず、Board 内 useReducer で管理する。
 */
export type DragState = {
  readonly draggingTaskFilePath: string;
  readonly draggingFromColumn: string;
  readonly hoverColumn: string | null;
  readonly hoverIndex: number | null;
} | null;

/**
 * DragAction の companion。各 variant のコンストラクタを集約する。
 * 呼び出し側は `dispatch(DragAction.start(...))` のように使う。
 */
export const DragAction = {
  /**
   * 開始 action を構築する。
   * @param taskFilePath ドラッグ対象 task の filePath
   * @param fromColumn 元カラム名
   * @returns DragActionStart
   */
  start: (taskFilePath: string, fromColumn: string): DragActionStart => ({
    type: "start",
    taskFilePath,
    fromColumn,
  }),
  /**
   * hover 位置更新 action を構築する。
   * @param column hover 中のカラム名（外れた場合は null）
   * @param index hover 中の挿入位置（外れた場合は null）
   * @returns DragActionHover
   */
  hover: (column: string | null, index: number | null): DragActionHover => ({
    type: "hover",
    column,
    index,
  }),
  /**
   * 終了 action を構築する。
   * @returns DragActionEnd
   */
  end: (): DragActionEnd => ({ type: "end" }),
} as const;

/**
 * DragState reducer。
 *
 * @param state 現在の DragState
 * @param action 適用する DragAction
 * @returns 次の DragState
 */
export const dragReducer: Reducer<DragState, DragAction> = (state, action) => {
  switch (action.type) {
    case "start":
      return {
        draggingTaskFilePath: action.taskFilePath,
        draggingFromColumn: action.fromColumn,
        hoverColumn: null,
        hoverIndex: null,
      };
    case "hover":
      if (state === null) {
        return state;
      }
      if (
        state.hoverColumn === action.column &&
        state.hoverIndex === action.index
      ) {
        return state;
      }
      return { ...state, hoverColumn: action.column, hoverIndex: action.index };
    case "end":
      return null;
    default: {
      action satisfies never;
      return state;
    }
  }
};

/** DnD で使用する独自 MIME 型。外部 D&D を弾くための固定 string。 */
export const DRAG_MIME_TYPE = "application/x-spec-board-task";
