import type { Decorator } from "@storybook/react-vite";
import { BoardCardProvider, type BoardCardProviderProps } from "./index";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type BoardCardDecoratorArgs = Partial<Omit<BoardCardProviderProps, "children">>;

/**
 * Storybook の decorators 配列向けに `BoardCardProvider` で Story をラップする。
 * 渡されなかった prop は空配列 / 空 Map / no-op で埋まる。
 *
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withBoardCardProvider =
  (args: BoardCardDecoratorArgs = {}): Decorator =>
  (Story) => (
    <BoardCardProvider
      tasks={[]}
      allTasks={[]}
      tasksByNormalizedPath={new Map()}
      milestonesByName={new Map()}
      dndDisabled={false}
      {...args}
    >
      <Story />
    </BoardCardProvider>
  );
