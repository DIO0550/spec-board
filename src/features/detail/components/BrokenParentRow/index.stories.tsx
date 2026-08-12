// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrokenParentRow } from ".";

const meta: Meta<typeof BrokenParentRow> = {
  component: BrokenParentRow,
  args: { parentFilePath: "tasks/missing-parent.md" },
};
export default meta;
type Story = StoryObj<typeof BrokenParentRow>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { parentFilePath: "epics/release/missing-parent.md" },
};
export const EdgeCases: Story = {
  args: { parentFilePath: "非常に長い/存在しない/親タスクへの参照.md" },
};
