// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { initialColumns, initialTasks } from "@/test-fixtures";
import type { Column as ColumnType } from "@/types/column";
import { withBoardProviders } from "../BoardProviders/storybook/decorator";
import { Board } from ".";

const renderBoard = (columns: readonly ColumnType[]): ReactElement => {
  const ordered = [...columns].sort((a, b) => a.order - b.order);
  return (
    <Board>
      {ordered.map((col, index) => (
        <Board.Column
          key={col.name}
          name={col.name}
          color={col.color}
          order={index}
          onAddClick={() => {}}
          onTaskClick={() => {}}
          onRename={() => {}}
          onDelete={() => {}}
        />
      ))}
      <Board.AddColumn onAdd={() => {}} />
    </Board>
  );
};

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
};

export default meta;

type Story = StoryObj<typeof Board>;

export const Default: Story = {
  render: () => renderBoard(initialColumns),
};

export const Empty: Story = {
  decorators: [
    withBoardProviders({
      columns: initialColumns,
      tasks: [],
      allTasks: [],
      doneColumn: "Done",
    }),
  ],
  render: () => renderBoard(initialColumns),
};

const singleTodoColumn: ColumnType[] = [{ name: "Todo", order: 0 }];
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
  render: () => renderBoard(singleTodoColumn),
};
