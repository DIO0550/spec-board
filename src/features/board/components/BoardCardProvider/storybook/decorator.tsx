import type { Decorator } from "@storybook/react-vite";
import { BoardCardProvider, type BoardCardProviderProps } from "../index";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type BoardCardDecoratorArgs = Partial<Omit<BoardCardProviderProps, "children">>;

/**
 * Storybook の decorators 配列向けに `BoardCardProvider` で Story をラップする。
 * 渡されなかった prop は空配列 / no-op で埋まる。
 *
 * `tasksByNormalizedPath` は意図的に渡さない。Provider 側で `allTasks` から
 * フォールバック構築されるため、ここで空 `Map()` を渡すと link / child を持つ
 * fixture（initialTasks 等）が全 ref broken と誤判定されてしまう。
 *
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withBoardCardProvider =
  (args: BoardCardDecoratorArgs = {}): Decorator =>
  (Story) => (
    <BoardCardProvider tasks={[]} allTasks={[]} dndDisabled={false} {...args}>
      <Story />
    </BoardCardProvider>
  );
