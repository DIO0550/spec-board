import type { ComponentType, PropsWithChildren } from "react";
import { BoardCardProvider, type BoardCardProviderProps } from "./index";

/** wrapper に渡せる Partial の props（children は内部で当てる） */
type BoardCardWrapperArgs = Partial<Omit<BoardCardProviderProps, "children">>;

/**
 * Wrapper のデフォルト。`tasksByNormalizedPath` は意図的に含めない。
 * Provider 側で `allTasks` からフォールバック構築されるため、ここで空 `Map()` を
 * 渡すと link / child を持つ fixture で全 ref が broken と誤判定される。
 */
const DEFAULTS: Omit<BoardCardProviderProps, "children"> = {
  tasks: [],
  allTasks: [],
  milestonesByName: new Map(),
  doneColumn: undefined,
  dndDisabled: false,
  onTaskDrop: undefined,
};

/**
 * RTL の render({ wrapper }) 向けに `ComponentType<PropsWithChildren>` を返す helper。
 * 渡されなかった prop はテスト用のデフォルト値（空配列 / no-op）で埋まる。
 *
 * @param args 上書きしたい props（任意）
 * @returns wrapper 用のコンポーネント
 */
export const createBoardCardWrapper = (
  args: BoardCardWrapperArgs = {},
): ComponentType<PropsWithChildren> => {
  /**
   * BoardCardProvider を mount する内部ラッパ。children を Provider 配下へ流す。
   * @param props - {@link PropsWithChildren}
   * @returns Provider 要素
   */
  const Wrapper = ({ children }: PropsWithChildren) => (
    <BoardCardProvider {...DEFAULTS} {...args}>
      {children}
    </BoardCardProvider>
  );
  Wrapper.displayName = "BoardCardWrapper";
  return Wrapper;
};
