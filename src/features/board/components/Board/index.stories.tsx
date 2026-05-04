// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { Board } from ".";

const meta: Meta<typeof Board> = {
  component: Board,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    columns: initialColumns,
    tasks: initialTasks,
    doneColumn: "Done",
    onAddTask: () => {},
    onTaskClick: () => {},
    onAddColumn: () => {},
    onRenameColumn: () => {},
    onDeleteColumn: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Board>;

export const Default: Story = {};

export const Empty: Story = {
  args: { tasks: [] },
};

export const SingleColumn: Story = {
  args: {
    columns: [{ name: "Todo", order: 0 }],
    tasks: initialTasks.filter((t) => t.status === "Todo"),
  },
};
