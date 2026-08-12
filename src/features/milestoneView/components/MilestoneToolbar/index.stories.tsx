// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MilestoneToolbar } from ".";

const meta: Meta<typeof MilestoneToolbar> = {
  component: MilestoneToolbar,
  parameters: { layout: "padded" },
  args: {
    filter: "all",
    onFilterChange: fn(),
    query: "",
    onQueryChange: fn(),
    sort: "order",
    onSortChange: fn(),
    view: "list",
    onViewChange: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneToolbar>;
export const Default: Story = {};
export const AllProps: Story = {
  args: { filter: "open", query: "通知", sort: "due", view: "roadmap" },
};
export const EdgeCases: Story = {
  args: { filter: "closed", query: "一致しない非常に長い検索語", sort: "name" },
};
