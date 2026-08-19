import {
  createContext,
  type ReactNode,
  type Reducer,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { buildTasksByNormalizedPath } from "@/domains/broken-link";
import { DEFAULT_DONE_COLUMN } from "@/domains/project-columns";
import {
  type SubIssueCounts,
  TaskProjection,
  type TaskProjectionMap,
} from "@/domains/task-projection";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Task } from "@/types/task";
import type { MilestonesByName } from "../TaskCard";

/** drop 確定時に呼ばれる引数（Card 用）。 */
export type TaskDrop = {
  readonly taskFilePath: string;
  readonly fromColumn: string;
  readonly toColumn: string;
  readonly toIndex: number;
};

/**
 * drop ハンドラの戻り値型。sync / async 双方の handler を許容するため `unknown` を使い、
 * await の挙動（Promise なら resolve まで待つ / それ以外は値をそのまま返す）に乗せる。
 */
export type TaskDropHandler = (params: TaskDrop) => unknown;

/** BoardCardProvider の Props */
export type BoardCardProviderProps = {
  /** 表示用タスク（絞り込み後） */
  tasks: readonly Task[];
  /** 階層カウント用 全タスク（絞り込み前）。lookup / descendantCount の source */
  allTasks: readonly Task[];
  /**
   * 正規化済み Task.filePath → Task の lookup Map。broken link 判定で参照する。
   * 未指定時は `allTasks` から `buildTasksByNormalizedPath` で派生させる
   * （空 Map を渡すと全参照を broken 扱いしてしまうため optional + fallback とする）。
   */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** name → マイルストーン定義 Map。未指定時は空 Map */
  milestonesByName?: MilestonesByName;
  /** 完了カラム名 */
  doneColumn?: string;
  /**
   * filePath -> projection（BE 集計）。descendantCount / isDone の source。
   *
   * **必須**。optional にすると配線漏れが typecheck を通り、全カードが無言で
   * `0/0`・`false` に縮退する。値を持たないテスト / Storybook は
   * `TaskProjection.emptyMap` を明示的に渡す。
   */
  projections: TaskProjectionMap;
  /** カード / カラムの DnD を無効化するか */
  dndDisabled?: boolean;
  /** drop 確定時のコールバック。Promise reject や throw は内部で握り、end() を必ず走らせる */
  onTaskDrop?: TaskDropHandler;
  /** 配下の children */
  children: ReactNode;
};

/** BoardCardProvider が公開する API */
export type BoardCardApi = {
  /**
   * filePath が現在ドラッグ中か。
   * @param filePath 判定対象 task の filePath
   * @returns ドラッグ中なら true
   */
  isDragging: (filePath: string) => boolean;
  /** hover ターゲット（column / index） */
  hoverTarget: {
    readonly column: string | null;
    readonly index: number | null;
  };
  /**
   * 現在のドラッグ起点（filePath / fromColumn）。idle のときは null。
   * drop 確定時に Column が「ドラッグ開始時の fromColumn」を復元するために参照する。
   */
  dragSource: {
    readonly filePath: string;
    readonly fromColumn: string;
  } | null;
  /** DnD 無効フラグ */
  dndDisabled: boolean;

  /**
   * ドラッグ開始を通知する。
   * @param filePath ドラッグ対象 task の filePath
   * @param fromColumn 元カラム名
   */
  startDrag: (filePath: string, fromColumn: string) => void;
  /**
   * hover ターゲットを更新する（drag leave 時は null, null）。
   * @param column hover 中のカラム名（外れたら null）
   * @param index hover 中の挿入位置（外れたら null）
   */
  hover: (column: string | null, index: number | null) => void;
  /** ドラッグ終了を通知する。 */
  end: () => void;

  /**
   * drop を確定し永続化フックを呼ぶ。throw / reject は握り潰し、必ず end() を走らせる。
   * @param params 移動パラメータ
   */
  dropTask: (params: TaskDrop) => Promise<void>;

  /**
   * filePath から Task を引き当てる（allTasks ベース）。
   * @param filePath 引き当てたい task の filePath
   * @returns 該当 task、なければ undefined
   */
  byPath: (filePath: string) => Task | undefined;
  /**
   * name からマイルストーン定義を引き当てる。
   * @param name マイルストーン名
   * @returns 該当定義、なければ undefined
   */
  milestoneByName: (name: string) => MilestoneDefinition | undefined;
  /**
   * 指定カラムが完了カラムか。
   * @param columnName 判定対象のカラム名
   */
  isDoneColumn: (columnName: string) => boolean;
  /** 完了カラム名（effective、TaskCardContext 互換のため公開） */
  doneColumn: string;
  /**
   * filePath を root とする子孫タスクの完了 / 総数を返す。
   * 未登録のときは固定参照 `TaskProjection.empty.subIssueProgress` を返し、
   * 子の useMemo が miss しないようにする。
   * @param filePath 起点 task の filePath
   */
  descendantCount: (filePath: string) => SubIssueCounts;
  /**
   * task 自身が完了カラムに居るか（BE projection 由来）。
   * カラム名判定の `isDoneColumn` とは別物。
   * @param filePath 判定対象 task の filePath
   */
  isDone: (filePath: string) => boolean;

  /**
   * 指定カラムに属する表示用タスクを返す（tasks ベースの status 別 grouping）。
   * 該当なしのときは固定参照 `EMPTY_TASKS` を返し参照同一性を保証する。
   * @param columnName 対象カラム名
   */
  tasksInColumn: (columnName: string) => readonly Task[];

  /**
   * フィルタ非適用の allTasks から status 一致件数を返す（WIP 超過判定用）。
   * `tasksInColumn` はフィルタ後の tasks ベースなので、絞り込み中の超過判定には使えない。
   * @param columnName 対象カラム名
   */
  totalCountInColumn: (columnName: string) => number;

  /** name → マイルストーン定義 Map（TaskCardContext 互換のため生 Map を公開） */
  milestonesByName: MilestonesByName;
  /** 正規化済み filePath → Task の lookup Map（broken link 判定で参照） */
  tasksByNormalizedPath: ReadonlyMap<string, Task>;
};

/** Provider 内部の DnD ローカル状態。 */
type CardDragState = {
  readonly draggingTaskFilePath: string;
  readonly draggingFromColumn: string;
  readonly hoverColumn: string | null;
  readonly hoverIndex: number | null;
} | null;

/** Provider 内部の DnD action（discriminated union）。 */
type CardDragAction =
  | {
      readonly type: "start";
      readonly taskFilePath: string;
      readonly fromColumn: string;
    }
  | {
      readonly type: "hover";
      readonly column: string | null;
      readonly index: number | null;
    }
  | { readonly type: "end" };

const boardCardReducer: Reducer<CardDragState, CardDragAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case "start":
      return {
        draggingTaskFilePath: action.taskFilePath,
        draggingFromColumn: action.fromColumn,
        hoverColumn: null,
        hoverIndex: null,
      };
    case "hover": {
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
    }
    case "end":
      return null;
    default: {
      action satisfies never;
      return state;
    }
  }
};

/** 該当 status のタスクなし時の tasksInColumn 用 固定参照。 */
const EMPTY_TASKS: readonly Task[] = [];
/** milestonesByName 未指定時の空 Map（参照同一性を保証）。 */
const EMPTY_MILESTONES: MilestonesByName = new Map();
/** hover 未設定時の hoverTarget の固定参照。 */
const IDLE_HOVER = { column: null, index: null } as const;

const BoardCardContext = createContext<BoardCardApi | null>(null);

/**
 * Board の Card 関心ごとを配布する Provider。
 * - DnD ローカル状態（drag / hover / end）
 * - drop の永続化フック呼び出し（try/catch/finally で end() 保証、throw は握る）
 * - Card 描画 lookup（byPath / milestoneByName / isDoneColumn / descendantCount / tasksInColumn）
 *
 * @param props - {@link BoardCardProviderProps}
 * @returns Provider 要素
 */
export const BoardCardProvider = ({
  tasks,
  allTasks,
  tasksByNormalizedPath: tasksByNormalizedPathProp,
  milestonesByName,
  doneColumn,
  projections,
  dndDisabled = false,
  onTaskDrop,
  children,
}: BoardCardProviderProps) => {
  const [dragState, dispatch] = useReducer(boardCardReducer, null);

  const effectiveDoneColumn = doneColumn ?? DEFAULT_DONE_COLUMN;
  const safeMilestonesByName = milestonesByName ?? EMPTY_MILESTONES;

  // tasksByNormalizedPath が未指定なら allTasks から派生する。空 Map で代用すると
  // hasAnyBrokenLink が全 ref を broken 扱いにしてしまうため、Provider 側で
  // 必ず「allTasks 由来の正しい lookup」にフォールバックさせる。
  const tasksByNormalizedPath = useMemo(
    () => tasksByNormalizedPathProp ?? buildTasksByNormalizedPath(allTasks),
    [tasksByNormalizedPathProp, allTasks],
  );

  const byPathMap = useMemo(
    () => new Map(allTasks.map((t) => [t.filePath, t])),
    [allTasks],
  );

  const tasksByStatus = useMemo(() => {
    // カラム名 (= task.status) はユーザー入力で任意文字列になり得る。
    // `{}` を辞書として使うと `__proto__` / `constructor` 等の特殊キーで
    // grouping が壊れる（プロトタイプ汚染）ため、prototype を持たない辞書で作る。
    const grouped: Record<string, Task[]> = Object.create(null);
    for (const task of tasks) {
      if (!grouped[task.status]) {
        grouped[task.status] = [];
      }
      grouped[task.status].push(task);
    }
    return grouped;
  }, [tasks]);

  const hoverTarget = useMemo(
    () =>
      dragState === null
        ? IDLE_HOVER
        : { column: dragState.hoverColumn, index: dragState.hoverIndex },
    [dragState],
  );

  const dragSource = useMemo(
    () =>
      dragState === null
        ? null
        : {
            filePath: dragState.draggingTaskFilePath,
            fromColumn: dragState.draggingFromColumn,
          },
    [dragState],
  );

  const isDragging = useCallback(
    (filePath: string): boolean =>
      dragState !== null && dragState.draggingTaskFilePath === filePath,
    [dragState],
  );

  const startDrag = useCallback((filePath: string, fromColumn: string) => {
    dispatch({ type: "start", taskFilePath: filePath, fromColumn });
  }, []);

  const hover = useCallback((column: string | null, index: number | null) => {
    dispatch({ type: "hover", column, index });
  }, []);

  const end = useCallback(() => {
    dispatch({ type: "end" });
  }, []);

  const dropTask = useCallback(
    async (params: TaskDrop): Promise<void> => {
      try {
        await onTaskDrop?.(params);
      } catch (e) {
        console.error(e);
      } finally {
        dispatch({ type: "end" });
      }
    },
    [onTaskDrop],
  );

  const byPath = useCallback(
    (filePath: string): Task | undefined => byPathMap.get(filePath),
    [byPathMap],
  );

  const milestoneByName = useCallback(
    (name: string): MilestoneDefinition | undefined =>
      safeMilestonesByName.get(name),
    [safeMilestonesByName],
  );

  const isDoneColumn = useCallback(
    (columnName: string): boolean => columnName === effectiveDoneColumn,
    [effectiveDoneColumn],
  );

  // 集計は BE (TaskIndex::project_all) が済ませている。ここは lookup のみで、
  // allTasks の変更ごとに全 task を DFS する O(N x M) を持たない。
  const descendantCount = useCallback(
    (filePath: string): SubIssueCounts =>
      TaskProjection.findByFilePath(projections, filePath).subIssueProgress,
    [projections],
  );

  const isDone = useCallback(
    (filePath: string): boolean =>
      TaskProjection.findByFilePath(projections, filePath).isDone,
    [projections],
  );

  const tasksInColumn = useCallback(
    (columnName: string): readonly Task[] =>
      tasksByStatus[columnName] ?? EMPTY_TASKS,
    [tasksByStatus],
  );

  const totalCountInColumn = useCallback(
    (columnName: string): number =>
      allTasks.reduce(
        (count, task) => (task.status === columnName ? count + 1 : count),
        0,
      ),
    [allTasks],
  );

  const api = useMemo<BoardCardApi>(
    () => ({
      isDragging,
      hoverTarget,
      dragSource,
      dndDisabled,
      startDrag,
      hover,
      end,
      dropTask,
      byPath,
      milestoneByName,
      isDoneColumn,
      doneColumn: effectiveDoneColumn,
      descendantCount,
      isDone,
      tasksInColumn,
      totalCountInColumn,
      milestonesByName: safeMilestonesByName,
      tasksByNormalizedPath,
    }),
    [
      isDragging,
      hoverTarget,
      dragSource,
      dndDisabled,
      startDrag,
      hover,
      end,
      dropTask,
      byPath,
      milestoneByName,
      isDoneColumn,
      effectiveDoneColumn,
      descendantCount,
      isDone,
      tasksInColumn,
      totalCountInColumn,
      safeMilestonesByName,
      tasksByNormalizedPath,
    ],
  );

  return (
    <BoardCardContext.Provider value={api}>
      {children}
    </BoardCardContext.Provider>
  );
};

/**
 * BoardCardProvider の API を取得する。Provider の外で呼ぶと throw する。
 * @returns BoardCardApi
 * @throws Provider の外で呼ばれた場合
 */
export const useBoardCard = (): BoardCardApi => {
  const ctx = useContext(BoardCardContext);
  if (ctx === null) {
    throw new Error(
      "useBoardCard は <BoardCardProvider> の配下でのみ使用できます",
    );
  }
  return ctx;
};
