// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/test-fixtures";
import type { Task } from "@/types/task";
import { TaskCard } from ".";

const baseTask: Task = initialTasks[0];

const meta: Meta<typeof TaskCard> = {
  component: TaskCard,
  args: {
    task: baseTask,
    childTasks: [],
    doneColumn: "Done",
  },
};

export default meta;

type Story = StoryObj<typeof TaskCard>;

export const Default: Story = {};

export const Clickable: Story = {
  args: { onClick: () => {} },
};

export const HighPriority: Story = {
  args: {
    task: { ...baseTask, priority: "High", title: "高優先度のタスク" },
  },
};

export const WithLabels: Story = {
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "frontend", "urgent"],
    },
  },
};

const childTasks = initialTasks.filter(
  (t) => t.hierarchy.parentFilePath === baseTask.filePath,
);

export const WithChildren: Story = {
  args: {
    task: { ...baseTask },
    childTasks,
  },
};

export const Minimal: Story = {
  args: {
    task: {
      ...baseTask,
      priority: undefined,
      labels: [],
      hierarchy: { ...baseTask.hierarchy, childFilePaths: [] },
      title: "最小構成のタスク",
    },
    childTasks: [],
  },
};
