// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { withBoardProviders } from "../BoardProviders/storybook/decorator";
import { Board } from ".";

const meta: Meta<typeof Board> = {
  component: Board,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    withBoardProviders({
      columns: initialColumns,
      tasks: initialTasks,
      allTasks: initialTasks,
      doneColumn: "Done",
    }),
  ],
  args: {
    columns: initialColumns,
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
  decorators: [
    withBoardProviders({
      columns: initialColumns,
      tasks: [],
      allTasks: [],
      doneColumn: "Done",
    }),
  ],
  args: { columns: initialColumns },
};

const singleTodoColumn = [{ name: "Todo", order: 0 }];
const singleColumnTasks = initialTasks.filter((t) => t.status === "Todo");

export const SingleColumn: Story = {
  decorators: [
    withBoardProviders({
      columns: singleTodoColumn,
      tasks: singleColumnTasks,
      allTasks: initialTasks,
      doneColumn: "Done",
    }),
  ],
  args: { columns: singleTodoColumn },
};
