import type { Decorator } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { BoardProviders } from ".";

/** decorator に渡せる props（children は Story が当てる） */
type BoardProvidersDecoratorArgs = Omit<
  ComponentProps<typeof BoardProviders>,
  "children"
>;

/**
 * Storybook の decorators 配列向けに `BoardProviders` で Story をラップする。
 * 既存 `withBoardCardProvider` / `withBoardColumnProvider` と同 tier の API。
 *
 * @param args 上書きしたい props
 * @returns Storybook の Decorator
 */
export const withBoardProviders =
  (args: BoardProvidersDecoratorArgs): Decorator =>
  (Story) => (
    <BoardProviders {...args}>
      <Story />
    </BoardProviders>
  );
