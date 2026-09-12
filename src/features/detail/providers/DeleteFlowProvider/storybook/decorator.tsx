import type { Decorator } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { detailTask } from "@/features/detail/components/storybook/fixtures";
import { DeleteFlowProvider, type DeleteFlowProviderProps } from "../index";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type DeleteFlowDecoratorArgs = Partial<
  Omit<DeleteFlowProviderProps, "children">
>;

/**
 * `DeleteFlowProvider` で Story をラップする Decorator を返す。
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withDeleteFlowProvider =
  (args: DeleteFlowDecoratorArgs = {}): Decorator =>
  (Story) => (
    <DeleteFlowProvider task={detailTask} onDelete={fn()} {...args}>
      <Story />
    </DeleteFlowProvider>
  );
