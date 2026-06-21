import type { PropsWithChildren, ReactNode } from "react";
import type { Task } from "@/types/task";
import {
  BoardCardProvider,
  type BoardCardProviderProps,
} from "../../BoardCardProvider";

/** BoardCardProvider に渡せる Partial の props（children は内部で当てる） */
export type CardWrapperArgs = Partial<
  Omit<BoardCardProviderProps, "children">
> & {
  /** allTasks のフォールバック（未指定なら [task] を使う想定で task を渡す） */
  task?: Task;
};

/**
 * TaskCard 系テストで BoardCardProvider 配下に children を mount する helper。
 * task を渡すと allTasks のデフォルトに使い、descendantCount が動くようにする。
 *
 * @param children Provider 配下に描画する React 要素
 * @param args 上書きしたい Provider props（任意）
 * @returns Provider でラップした要素
 */
export const wrapWithCardProvider = (
  children: ReactNode,
  args: CardWrapperArgs = {},
) => {
  const allTasks =
    args.allTasks ?? (args.task !== undefined ? [args.task] : []);
  // tasksByNormalizedPath は明示時のみ渡す。未指定なら Provider が allTasks から
  // フォールバック構築するので、空 Map で潰さない。
  return (
    <BoardCardProvider
      tasks={args.tasks ?? allTasks}
      allTasks={allTasks}
      tasksByNormalizedPath={args.tasksByNormalizedPath}
      milestonesByName={args.milestonesByName}
      doneColumn={args.doneColumn}
      dndDisabled={args.dndDisabled}
      onTaskDrop={args.onTaskDrop}
    >
      {children}
    </BoardCardProvider>
  );
};

/**
 * ↑ の wrapper を `ComponentType<PropsWithChildren>` 形式で取得する（renderHook 等用）。
 * @param args 上書きしたい Provider props（任意）
 * @returns wrapper コンポーネント
 */
export const createCardProviderWrapper = (args: CardWrapperArgs = {}) => {
  const Wrapper = ({ children }: PropsWithChildren) =>
    wrapWithCardProvider(children, args);
  Wrapper.displayName = "TestCardProviderWrapper";
  return Wrapper;
};
