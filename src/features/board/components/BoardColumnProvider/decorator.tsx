import type { Decorator } from "@storybook/react-vite";
import { BoardColumnProvider, type BoardColumnProviderProps } from "./index";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type BoardColumnDecoratorArgs = Partial<
  Omit<BoardColumnProviderProps, "children">
>;

/**
 * Storybook の decorators 配列向けに `BoardColumnProvider` で Story をラップする。
 * 渡されなかった prop は空配列 / no-op で埋まる。
 *
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withBoardColumnProvider =
  (args: BoardColumnDecoratorArgs = {}): Decorator =>
  (Story) => (
    <BoardColumnProvider columns={[]} tasks={[]} dndDisabled={false} {...args}>
      <Story />
    </BoardColumnProvider>
  );
