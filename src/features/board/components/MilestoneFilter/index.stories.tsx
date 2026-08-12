import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MilestoneFilter } from ".";

const milestones = [
  { name: "v1.0", title: "正式リリース", due: "2026-09-30" },
  { name: "v1.1", title: "品質改善" },
];
const meta = {
  component: MilestoneFilter,
  args: { milestones, filter: { kind: "all" }, onChange: fn() },
} satisfies Meta<typeof MilestoneFilter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { filter: { kind: "milestone", name: "v1.0" } },
};
export const EdgeCases: Story = {
  args: { milestones: [], filter: { kind: "unassigned" } },
};
