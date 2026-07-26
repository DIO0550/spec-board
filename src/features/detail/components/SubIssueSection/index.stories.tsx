// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/test-fixtures";
import { SubIssueSection } from ".";

const parentTask = initialTasks[0];
const childTasks = initialTasks.filter(
  (t) => t.hierarchy.parentFilePath === parentTask.filePath,
);

const meta: Meta<typeof SubIssueSection> = {
  component: SubIssueSection,
  args: {
    parentTask,
    childTasks: [],
    subIssueCounts: { done: 0, total: 0 },
    isDone: () => false,
    onAddSubIssue: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SubIssueSection>;

export const Empty: Story = {
  args: { childTasks: [], subIssueCounts: { done: 0, total: 0 } },
};

export const WithChildren: Story = {
  args: {
    childTasks,
    subIssueCounts: { done: 0, total: childTasks.length },
  },
};

export const Clickable: Story = {
  args: {
    childTasks,
    subIssueCounts: { done: 0, total: childTasks.length },
    onChildClick: () => {},
  },
};

export const WithDescendantsBeyondDirectChildren: Story = {
  args: {
    childTasks,
    // 直下子より子孫の方が多いケース（孫 2 件が完了済み）。
    subIssueCounts: { done: 2, total: childTasks.length + 2 },
  },
};
