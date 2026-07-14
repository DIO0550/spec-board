import {
  createContext,
  type ReactNode,
  type Reducer,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/** drop 確定時に呼ばれる引数（カラム並び替え用）。 */
export type ColumnReorder = {
  readonly fromColumnName: string;
  readonly toColumnName: string;
};

/**
 * カラム reorder ハンドラの戻り値型。sync / async 双方を許容するため `unknown` を使う。
 * await の挙動（Promise なら resolve まで待つ / それ以外は値をそのまま返す）に乗せる。
 */
export type ColumnReorderHandler = (params: ColumnReorder) => unknown;

/** BoardColumnProvider の Props */
export type BoardColumnProviderProps = {
  /** カラム定義の配列 */
  columns: readonly Column[];
  /** 表示用タスク（絞り込み後）。allTasks 未指定時に hierarchyTasks のフォールバックに使う */
  tasks: readonly Task[];
  /** 階層カウント用 全タスク（絞り込み前）。taskCountInColumn の集計 source */
  allTasks?: readonly Task[];
  /** カード / カラムの DnD を無効化するか */
  dndDisabled?: boolean;
  /** カラム並び替え確定時のコールバック。throw は内部で握り、end() を必ず走らせる */
  onColumnReorder?: ColumnReorderHandler;
  /** 配下の children */
  children: ReactNode;
};

/** BoardColumnProvider が公開する API */
export type BoardColumnApi = {
  /**
   * columnName が現在ドラッグ中か。
   * @param columnName 判定対象のカラム名
   * @returns ドラッグ中なら true
   */
  isDragging: (columnName: string) => boolean;
  /** hover index（外れている / idle のときは null） */
  hoverIndex: number | null;
  /** DnD 無効フラグ */
  dndDisabled: boolean;

  /**
   * カラムドラッグ開始を通知する。
   * @param columnName ドラッグ対象のカラム名
   */
  startDrag: (columnName: string) => void;
  /**
   * hover index を更新する（drag leave 時は null）。
   * @param index hover 中の挿入位置（外れたら null）
   */
  hover: (index: number | null) => void;
  /** カラムドラッグ終了を通知する。 */
  end: () => void;

  /**
   * カラム並び替えを確定し永続化フックを呼ぶ。throw / reject は握り潰し、必ず end() を走らせる。
   * @param params 並び替えパラメータ
   * @returns 完了 Promise（reject しない）
   */
  dropColumn: (params: ColumnReorder) => Promise<void>;

  /**
   * 全カラム名を columns 順で返す（AddColumnButton の重複チェック等で参照）。
   * @returns 全カラム名の readonly 配列
   */
  existingNames: () => readonly string[];
  /**
   * 自身を除いた他のカラム名を返す（Column のリネーム検証で参照）。
   * @param currentName 除外するカラム名
   * @returns 他カラム名の readonly 配列
   */
  existingNamesExcluding: (currentName: string) => readonly string[];
  /**
   * 削除可能か判定する。columns.length > 1 なら true。
   * 引数 columnName は API 統一のため受け取るが、現状判定には未使用。
   * @param columnName 削除対象のカラム名
   * @returns 削除可能なら true
   */
  canDelete: (columnName: string) => boolean;
  /**
   * カラムヘッダーを DnD ハンドルにできるか。columns.length > 1 なら true。
   * canDelete と同値の件数導出だが、削除可否ではなくドラッグ可否を表すため
   * 引数なしの値プロパティとして別に公開する。
   */
  columnDraggable: boolean;
  /**
   * 指定カラムのタスク件数を返す（hierarchyTasks ベース）。
   * @param columnName 対象カラム名
   * @returns 件数（該当なしは 0）
   */
  taskCountInColumn: (columnName: string) => number;
  /**
   * 指定カラムの order を返す。
   * @param columnName 対象カラム名
   * @returns order、該当なしは undefined
   */
  orderOf: (columnName: string) => number | undefined;
};

/** Provider 内部のカラム DnD ローカル状態。 */
type ColumnDragState = {
  readonly draggingColumnName: string;
  readonly hoverIndex: number | null;
} | null;

/** Provider 内部のカラム DnD action（discriminated union）。 */
type ColumnDragAction =
  | { readonly type: "start"; readonly columnName: string }
  | { readonly type: "hover"; readonly index: number | null }
  | { readonly type: "end" };

const boardColumnReducer: Reducer<ColumnDragState, ColumnDragAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case "start":
      return {
        draggingColumnName: action.columnName,
        hoverIndex: null,
      };
    case "hover": {
      if (state === null) {
        return state;
      }
      if (state.hoverIndex === action.index) {
        return state;
      }
      return { ...state, hoverIndex: action.index };
    }
    case "end":
      return null;
    default: {
      action satisfies never;
      return state;
    }
  }
};

const BoardColumnContext = createContext<BoardColumnApi | null>(null);

/**
 * Board の Column 関心ごとを配布する Provider。
 * - カラム DnD ローカル状態（drag / hover / end）
 * - カラム reorder の永続化フック呼び出し（try/catch/finally で end() 保証、throw は握る）
 * - Column 描画 lookup（existingNames / canDelete / taskCountInColumn / orderOf）
 *
 * @param props - {@link BoardColumnProviderProps}
 * @returns Provider 要素
 */
export const BoardColumnProvider = ({
  columns,
  tasks,
  allTasks,
  dndDisabled = false,
  onColumnReorder,
  children,
}: BoardColumnProviderProps) => {
  const [dragState, dispatch] = useReducer(boardColumnReducer, null);

  const hierarchyTasks = allTasks ?? tasks;

  const columnNamesArr = useMemo(() => columns.map((c) => c.name), [columns]);

  const taskCountByStatus = useMemo(() => {
    // カラム名 (= task.status) はユーザー入力で任意文字列になり得る。
    // `{}` を辞書として使うと `__proto__` / `constructor` 等のキーで集計が
    // 壊れる（プロトタイプ汚染）ため、prototype を持たない辞書で作る。
    const counts: Record<string, number> = Object.create(null);
    for (const t of hierarchyTasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [hierarchyTasks]);

  const isDragging = useCallback(
    (columnName: string): boolean =>
      dragState !== null && dragState.draggingColumnName === columnName,
    [dragState],
  );

  const startDrag = useCallback((columnName: string) => {
    dispatch({ type: "start", columnName });
  }, []);

  const hover = useCallback((index: number | null) => {
    dispatch({ type: "hover", index });
  }, []);

  const end = useCallback(() => {
    dispatch({ type: "end" });
  }, []);

  const dropColumn = useCallback(
    async (params: ColumnReorder): Promise<void> => {
      try {
        await onColumnReorder?.(params);
      } catch (e) {
        console.error(e);
      } finally {
        dispatch({ type: "end" });
      }
    },
    [onColumnReorder],
  );

  const existingNames = useCallback(
    (): readonly string[] => columnNamesArr,
    [columnNamesArr],
  );

  const existingNamesExcluding = useCallback(
    (currentName: string): readonly string[] =>
      columnNamesArr.filter((n) => n !== currentName),
    [columnNamesArr],
  );

  const canDelete = useCallback(
    (_columnName: string): boolean => columnNamesArr.length > 1,
    [columnNamesArr],
  );

  const taskCountInColumn = useCallback(
    (columnName: string): number => taskCountByStatus[columnName] ?? 0,
    [taskCountByStatus],
  );

  const orderOf = useCallback(
    (columnName: string): number | undefined =>
      columns.find((c) => c.name === columnName)?.order,
    [columns],
  );

  const api = useMemo<BoardColumnApi>(
    () => ({
      isDragging,
      hoverIndex: dragState?.hoverIndex ?? null,
      dndDisabled,
      startDrag,
      hover,
      end,
      dropColumn,
      existingNames,
      existingNamesExcluding,
      canDelete,
      columnDraggable: columnNamesArr.length > 1,
      taskCountInColumn,
      orderOf,
    }),
    [
      isDragging,
      dragState,
      dndDisabled,
      startDrag,
      hover,
      end,
      dropColumn,
      existingNames,
      existingNamesExcluding,
      canDelete,
      columnNamesArr,
      taskCountInColumn,
      orderOf,
    ],
  );

  return (
    <BoardColumnContext.Provider value={api}>
      {children}
    </BoardColumnContext.Provider>
  );
};

/**
 * BoardColumnProvider の API を取得する。Provider の外で呼ぶと throw する。
 * @returns BoardColumnApi
 * @throws Provider の外で呼ばれた場合
 */
export const useBoardColumn = (): BoardColumnApi => {
  const ctx = useContext(BoardColumnContext);
  if (ctx === null) {
    throw new Error(
      "useBoardColumn は <BoardColumnProvider> の配下でのみ使用できます",
    );
  }
  return ctx;
};
