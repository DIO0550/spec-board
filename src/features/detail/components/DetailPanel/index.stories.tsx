// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { DetailPanel } from ".";

const baseTask = initialTasks[1];

const meta: Meta<typeof DetailPanel> = {
  component: DetailPanel,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    task: baseTask,
    columns: initialColumns,
    allTasks: initialTasks,
    doneColumn: "Done",
    onClose: () => {},
    onTaskUpdate: () => {},
    onDelete: () => {},
    onAddSubIssue: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof DetailPanel>;

export const Default: Story = {};

export const WithChildren: Story = {
  args: { task: initialTasks[0] },
};

export const WithParent: Story = {
  args: { task: initialTasks[2] },
};

export const Minimal: Story = {
  args: {
    task: {
      ...baseTask,
      title: "",
      body: "",
      labels: [],
      priority: undefined,
    },
    onAddSubIssue: undefined,
  },
};
