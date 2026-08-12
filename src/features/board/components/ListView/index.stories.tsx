import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { ListView } from ".";

const meta = {
  component: ListView,
  args: {
    tasks: initialTasks,
    columns: initialColumns,
    doneColumn: "Done",
    onTaskClick: fn(),
    onAddTask: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ListView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    tasks: initialTasks.map((task, index) => ({
      ...task,
      due: `2026-09-${String(index + 10).padStart(2, "0")}`,
    })),
    selectedTaskId: initialTasks[1].id,
  },
};
export const EdgeCases: Story = {
  args: {
    tasks: [
      {
        ...initialTasks[0],
        title: "非常に長いタイトルを持つタスク".repeat(8),
        labels: Array.from({ length: 8 }, (_, index) => `label-${index + 1}`),
      },
    ],
  },
};
export const Active: Story = { args: { selectedTaskId: initialTasks[0].id } };
export const Empty: Story = { args: { tasks: [] } };
export const NoResults: Story = {
  args: { tasks: [], columns: [], filterActive: true },
};
