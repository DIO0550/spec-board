// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MilestoneProgressBar } from ".";

const meta: Meta<typeof MilestoneProgressBar> = {
  component: MilestoneProgressBar,
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
  args: { done: 6, total: 10, ratio: 0.6 },
};
export default meta;
type Story = StoryObj<typeof MilestoneProgressBar>;
export const Default: Story = {};
export const AllProps: Story = { args: { done: 10, total: 10, ratio: 1 } };
export const EdgeCases: Story = {
  args: { done: 0, total: 0, ratio: undefined },
};
