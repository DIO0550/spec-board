// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MilestoneCountdownBadge } from ".";

const meta: Meta<typeof MilestoneCountdownBadge> = {
  component: MilestoneCountdownBadge,
  args: { countdown: { kind: "future", label: "あと55日" } },
};
export default meta;
type Story = StoryObj<typeof MilestoneCountdownBadge>;
export const Default: Story = {};
export const AllProps: Story = {
  render: () => (
    <div className="flex gap-2">
      <MilestoneCountdownBadge
        countdown={{ kind: "overdue", label: "22日超過" }}
      />
      <MilestoneCountdownBadge countdown={{ kind: "soon", label: "あと3日" }} />
      <MilestoneCountdownBadge countdown={{ kind: "done", label: "完了" }} />
    </div>
  ),
};
export const EdgeCases: Story = {
  args: { countdown: { kind: "none", label: "期日未設定" } },
};
