// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddColumnButton } from ".";

const meta: Meta<typeof AddColumnButton> = {
  component: AddColumnButton,
  args: {
    existingColumnNames: ["Todo", "In Progress", "Done"],
    onAdd: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof AddColumnButton>;

export const Default: Story = {};
