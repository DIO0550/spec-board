import type { ReactNode } from "react";
import type { Task } from "@/domains/task";
import type { Column as ColumnType } from "@/types/column";
import { BoardCardProvider, type TaskDropHandler } from "../BoardCardProvider";
import {
  BoardColumnProvider,
  type ColumnReorderHandler,
} from "../BoardColumnProvider";
import type { MilestonesByName } from "../TaskCard";

/**
 * Board feature の Context Provider 2 段（{@link BoardCardProvider} +
 * {@link BoardColumnProvider}）を 1 つに合成した Provider の Props。
 * 共通項（`tasks` / `allTasks` / `dndDisabled`）は呼び出し側で 1 度書けば
 * 内部で両 Provider に同値で配線される。
 */
type BoardProvidersProps = {
  /** カラム定義の配列 */
  columns: readonly ColumnType[];
  /** 表示中のタスク（絞り込み後の表示用集合） */
  tasks: readonly Task[];
  /** 階層カウント等の解決に使う全タスク集合。共通項として両 Provider に同値で渡される */
  allTasks: readonly Task[];
  /** 正規化済み Task.filePath → Task の lookup Map */
  tasksByNormalizedPath?: ReadonlyMap<string, Task>;
  /** 完了カラム名 */
  doneColumn?: string;
  /** name → マイルストーン定義の Map（カードバッジ用） */
  milestonesByName?: MilestonesByName;
  /** カード / カラムの DnD を無効化するか。両 Provider に同値で配線される */
  dndDisabled?: boolean;
  /** タスク drop ハンドラ */
  onTaskDrop?: TaskDropHandler;
  /** カラム並び替えハンドラ */
  onColumnReorder?: ColumnReorderHandler;
  /** 配下に置く子要素 */
  children: ReactNode;
};

/**
 * Board feature の Context Provider 2 段（BoardCard + BoardColumn）を
 * 1 つに合成した Provider。flat な props を受け取り、内部で
 * `BoardCardProvider`（外側）→ `BoardColumnProvider`（内側）の順にラップする。
 *
 * 共通項（`tasks` / `allTasks` / `dndDisabled`）は両 Provider に同値で配線するため、
 * `ActiveBoardView` / Storybook decorator / テスト render ハーネスで二重に書かなくて済む。
 *
 * @param props - {@link BoardProvidersProps}
 * @returns Provider 要素
 */
export const BoardProviders = ({
  columns,
  tasks,
  allTasks,
  tasksByNormalizedPath,
  doneColumn,
  milestonesByName,
  dndDisabled = false,
  onTaskDrop,
  onColumnReorder,
  children,
}: BoardProvidersProps) => {
  return (
    <BoardCardProvider
      tasks={tasks}
      allTasks={allTasks}
      tasksByNormalizedPath={tasksByNormalizedPath}
      milestonesByName={milestonesByName}
      doneColumn={doneColumn}
      dndDisabled={dndDisabled}
      onTaskDrop={onTaskDrop}
    >
      <BoardColumnProvider
        columns={columns}
        tasks={tasks}
        allTasks={allTasks}
        dndDisabled={dndDisabled}
        onColumnReorder={onColumnReorder}
      >
        {children}
      </BoardColumnProvider>
    </BoardCardProvider>
  );
};
