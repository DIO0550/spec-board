// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/test-fixtures";
import type { Task } from "@/types/task";
import { Column } from ".";

const todoTasks = initialTasks.filter((t) => t.status === "Todo");

const meta: Meta<typeof Column> = {
  component: Column,
  parameters: {
    layout: "centered",
  },
  args: {
    name: "Todo",
    tasks: todoTasks,
    allTasks: initialTasks,
    doneColumn: "Done",
    existingColumnNames: ["In Progress", "Done"],
    canDelete: true,
    onAddClick: () => {},
    onTaskClick: () => {},
    onRename: () => {},
    onDelete: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Column>;

export const Default: Story = {};

export const Empty: Story = {
  args: { tasks: [] },
};

const manyTasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
  id: `many-${i}`,
  title: `タスク ${i + 1}`,
  status: "Todo",
  priority: i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low",
  labels: i % 2 === 0 ? ["sample"] : [],
  parent: undefined,
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: `tasks/many-${i}.md`,
}));

export const ManyTasks: Story = {
  args: { tasks: manyTasks },
};

export const WithoutMenu: Story = {
  args: { onDelete: undefined, onRename: undefined },
};
