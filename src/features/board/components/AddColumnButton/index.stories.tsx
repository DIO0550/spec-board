// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { withBoardColumnProvider } from "../BoardColumnProvider/storybook/decorator";
import { AddColumnButton } from ".";

const meta: Meta<typeof AddColumnButton> = {
  component: AddColumnButton,
  decorators: [
    withBoardColumnProvider({
      columns: [
        { name: "Todo", order: 0 },
        { name: "In Progress", order: 1 },
        { name: "Done", order: 2 },
      ],
      tasks: [],
    }),
  ],
  args: {
    onAdd: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof AddColumnButton>;

export const Default: Story = {};
