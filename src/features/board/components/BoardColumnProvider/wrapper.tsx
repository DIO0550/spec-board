import type { ComponentType, PropsWithChildren } from "react";
import { BoardColumnProvider, type BoardColumnProviderProps } from "./index";

/** wrapper に渡せる Partial の props（children は内部で当てる） */
type BoardColumnWrapperArgs = Partial<
  Omit<BoardColumnProviderProps, "children">
>;

const DEFAULTS: Omit<BoardColumnProviderProps, "children"> = {
  columns: [],
  tasks: [],
  allTasks: undefined,
  dndDisabled: false,
  onColumnReorder: undefined,
};

/**
 * RTL の render({ wrapper }) 向けに `ComponentType<PropsWithChildren>` を返す helper。
 * 渡されなかった prop はテスト用のデフォルト値（空配列 / no-op）で埋まる。
 *
 * @param args 上書きしたい props（任意）
 * @returns wrapper 用のコンポーネント
 */
export const createBoardColumnWrapper = (
  args: BoardColumnWrapperArgs = {},
): ComponentType<PropsWithChildren> => {
  /**
   * BoardColumnProvider を mount する内部ラッパ。children を Provider 配下へ流す。
   * @param props - {@link PropsWithChildren}
   * @returns Provider 要素
   */
  const Wrapper = ({ children }: PropsWithChildren) => (
    <BoardColumnProvider {...DEFAULTS} {...args}>
      {children}
    </BoardColumnProvider>
  );
  Wrapper.displayName = "BoardColumnWrapper";
  return Wrapper;
};
