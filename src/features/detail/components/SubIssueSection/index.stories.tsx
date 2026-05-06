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
    doneColumn: "Done",
    onAddSubIssue: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SubIssueSection>;

export const Empty: Story = {
  args: { childTasks: [] },
};

export const WithChildren: Story = {
  args: { childTasks },
};

export const Clickable: Story = {
  args: { childTasks, onChildClick: () => {} },
};
