// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MilestoneStateBadge } from ".";

const meta: Meta<typeof MilestoneStateBadge> = {
  component: MilestoneStateBadge,
  args: { status: "open" },
};
export default meta;
type Story = StoryObj<typeof MilestoneStateBadge>;
export const Default: Story = {};
export const AllProps: Story = {
  render: () => (
    <div className="flex gap-3">
      <MilestoneStateBadge status="open" />
      <MilestoneStateBadge status="closed" />
      <MilestoneStateBadge status="overdue" />
    </div>
  ),
};
export const EdgeCases: Story = { args: { status: "overdue" } };
