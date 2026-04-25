// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ColumnHeader } from ".";

const meta: Meta<typeof ColumnHeader> = {
  component: ColumnHeader,
  args: {
    name: "Todo",
    taskCount: 5,
    onAddClick: () => {},
    onRename: () => {},
    existingColumnNames: ["In Progress", "Done"],
    onContextMenu: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ColumnHeader>;

export const Default: Story = {};

export const WithoutActions: Story = {
  args: { onRename: undefined, onContextMenu: undefined },
};

export const LongName: Story = {
  args: {
    name: "とても長いカラム名のサンプル例 - 表示の折り返しを確認",
    taskCount: 99,
  },
};
