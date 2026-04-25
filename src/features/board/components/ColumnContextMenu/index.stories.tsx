// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColumnContextMenu } from ".";

const meta: Meta<typeof ColumnContextMenu> = {
  component: ColumnContextMenu,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    x: 120,
    y: 120,
    canDelete: true,
    onDelete: () => {},
    onClose: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ColumnContextMenu>;

export const Default: Story = {};
