import type { Decorator } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { BoardProviders } from "..";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type BoardProvidersDecoratorArgs = Partial<
  Omit<ComponentProps<typeof BoardProviders>, "children">
>;

/**
 * Storybook の decorators 配列向けに `BoardProviders` で Story をラップする。
 * 既存 `withBoardCardProvider` / `withBoardColumnProvider` と同 tier の API で、
 * 未指定の prop は空配列 / no-op で埋まる（required な columns / tasks / allTasks も
 * Story 側で省略可能にすることで、追加 Story でのボイラープレートと渡し忘れを防ぐ）。
 *
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withBoardProviders =
  (args: BoardProvidersDecoratorArgs = {}): Decorator =>
  (Story) => (
    <BoardProviders columns={[]} tasks={[]} allTasks={[]} {...args}>
      <Story />
    </BoardProviders>
  );
