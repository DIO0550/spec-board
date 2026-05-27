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
    descendantTasks: [],
    doneColumn: "Done",
    onAddSubIssue: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof SubIssueSection>;

export const Empty: Story = {
  args: { childTasks: [], descendantTasks: [] },
};

export const WithChildren: Story = {
  args: { childTasks, descendantTasks: childTasks },
};

export const Clickable: Story = {
  args: {
    childTasks,
    descendantTasks: childTasks,
    onChildClick: () => {},
  },
};

export const WithDescendantsBeyondDirectChildren: Story = {
  args: {
    childTasks,
    descendantTasks: [
      ...childTasks,
      ...initialTasks.slice(0, 2).map((t) => ({
        ...t,
        id: `extra-${t.id}`,
        status: "Done",
      })),
    ],
  },
};
