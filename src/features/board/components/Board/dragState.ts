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

/** DragActionStart の companion。type alias と同名で declaration merging。 */
export const DragActionStart = {
  /**
   * DragActionStart を生成する。
   * @param taskFilePath ドラッグ対象 task の filePath
   * @param fromColumn 元カラム名
   * @returns DragActionStart
   */
  create: (taskFilePath: string, fromColumn: string): DragActionStart => ({
    type: "start",
    taskFilePath,
    fromColumn,
  }),
} as const;

/** DragActionHover の companion。 */
export const DragActionHover = {
  /**
   * DragActionHover を生成する。
   * @param column hover 中のカラム名（外れた場合は null）
   * @param index hover 中の挿入位置（外れた場合は null）
   * @returns DragActionHover
   */
  create: (column: string | null, index: number | null): DragActionHover => ({
    type: "hover",
    column,
    index,
  }),
} as const;

/** DragActionEnd の companion。 */
export const DragActionEnd = {
  /**
   * DragActionEnd を生成する。
   * @returns DragActionEnd
   */
  create: (): DragActionEnd => ({ type: "end" }),
} as const;

/**
 * DragAction union 全体のファサード companion。
 * 各 variant の `.create` を一段引いて呼べるショートカット。
 */
export const DragAction = {
  start: DragActionStart.create,
  hover: DragActionHover.create,
  end: DragActionEnd.create,
} as const;

/**
 * DragState の companion。state factory / transformation / 判定を集約する。
 * 命名は State の視点で行い、reducer / action 用語に引きずられない。
 */
export const DragState = {
  /** idle（ドラッグしていない）の DragState 値。 */
  idle: null as DragState,

  /**
   * dragging 状態の DragState を生成する。hover 情報は未設定で開始。
   * @param taskFilePath ドラッグ対象 task の filePath
   * @param fromColumn 元カラム名
   * @returns dragging 状態の DragState
   */
  create: (taskFilePath: string, fromColumn: string): DragState => ({
    draggingTaskFilePath: taskFilePath,
    draggingFromColumn: fromColumn,
    hoverColumn: null,
    hoverIndex: null,
  }),

  /**
   * hover 情報を差し替えた新しい DragState を返す。idle や同値時は元参照を返す。
   * @param state 現在の DragState
   * @param column hover 中のカラム名（外れた場合は null）
   * @param index hover 中の挿入位置（外れた場合は null）
   * @returns 更新後の DragState
   */
  withHover: (
    state: DragState,
    column: string | null,
    index: number | null,
  ): DragState => {
    if (state === null) {
      return state;
    }
    if (state.hoverColumn === column && state.hoverIndex === index) {
      return state;
    }
    return { ...state, hoverColumn: column, hoverIndex: index };
  },

  /**
   * 指定 task が現在ドラッグ中か判定する。
   * @param state 現在の DragState
   * @param taskFilePath 判定対象の task filePath
   * @returns 判定結果
   */
  isDraggingTask: (state: DragState, taskFilePath: string): boolean =>
    state !== null && state.draggingTaskFilePath === taskFilePath,

  /**
   * 指定カラムが hover ターゲットなら hoverIndex を返す。それ以外は null。
   * placeholder 表示判定に使う。
   * @param state 現在の DragState
   * @param columnName 判定対象のカラム名
   * @returns hoverIndex または null
   */
  hoverIndexFor: (state: DragState, columnName: string): number | null =>
    state !== null && state.hoverColumn === columnName
      ? state.hoverIndex
      : null,
} as const;

/**
 * DragState reducer。companion メソッドに委譲する。
 *
 * @param state 現在の DragState
 * @param action 適用する DragAction
 * @returns 次の DragState
 */
export const dragReducer: Reducer<DragState, DragAction> = (state, action) => {
  switch (action.type) {
    case "start":
      return DragState.create(action.taskFilePath, action.fromColumn);
    case "hover":
      return DragState.withHover(state, action.column, action.index);
    case "end":
      return DragState.idle;
    default: {
      action satisfies never;
      return state;
    }
  }
};

export { DRAG_MIME_TYPE } from "./mime";
