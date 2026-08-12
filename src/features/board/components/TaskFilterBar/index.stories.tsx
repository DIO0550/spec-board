import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { EMPTY_TASK_FILTER } from "../../lib/applyTaskFilter";
import { TaskFilterBar } from ".";

const milestones = [{ name: "v1.0", title: "正式リリース", due: "2026-09-30" }];
const meta = {
  component: TaskFilterBar,
  args: {
    criteria: EMPTY_TASK_FILTER,
    onChange: fn(),
    onClear: fn(),
    availableLabels: ["frontend", "bug"],
    statuses: ["Todo", "In Progress", "Done"],
    milestones,
    isActive: false,
    filteredCount: 5,
    totalCount: 5,
  },
} satisfies Meta<typeof TaskFilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    criteria: {
      keyword: "検索",
      labels: ["frontend"],
      priorities: ["High"],
      statuses: ["Todo"],
      milestone: { kind: "milestone", name: "v1.0" },
    },
    isActive: true,
    filteredCount: 1,
  },
};
export const EdgeCases: Story = {
  args: {
    availableLabels: [],
    statuses: [],
    milestones: [],
    filteredCount: 0,
    totalCount: 0,
  },
};
