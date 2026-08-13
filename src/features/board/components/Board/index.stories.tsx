// @jsdoc-rules-disable

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import type { Column as ColumnType } from "@/types/column";
import { withBoardProviders } from "../BoardProviders/storybook/decorator";
import { Board } from ".";
import { DRAG_MIME_TYPE } from "./mime";

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
          onAddTask={() => {}}
          onTaskClick={() => {}}
          onRenameColumn={() => {}}
          onDeleteColumn={() => {}}
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
      // 集計は BE 由来なので、fixture 側で同じ契約の projection を組んで渡す。
      projections: buildProjectionsFixture(initialTasks, "Done"),
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
      projections: buildProjectionsFixture([], "Done"),
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
      projections: buildProjectionsFixture(initialTasks, "Done"),
    }),
  ],
  render: () => renderBoard(singleTodoColumn),
};

export const Compact: Story = {
  render: () => (
    <div data-density="compact" className="h-full">
      {renderBoard(initialColumns)}
    </div>
  ),
};

export const AllProps: Story = { ...Compact };
export const EdgeCases: Story = { ...Empty };

export const Print: Story = {
  render: () => renderBoard(initialColumns),
};

export const Dragging: Story = {
  render: () => renderBoard(initialColumns),
  play: async ({ canvasElement }) => {
    const dataTransfer = new DataTransfer();
    await fireEvent.dragStart(
      within(canvasElement).getAllByTestId("task-card")[0],
      { dataTransfer },
    );
    await expect(
      canvasElement.querySelector("[data-dragging='true']"),
    ).not.toBeNull();
  },
};

export const DropTarget: Story = {
  render: () => renderBoard(initialColumns),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getAllByTestId("task-card")[0];
    const doneColumn = canvas.getByTestId("column-Done");
    const dataTransfer = new DataTransfer();
    await fireEvent.dragStart(card, { dataTransfer });
    dataTransfer.setData(DRAG_MIME_TYPE, "tasks/task-1.md");
    await fireEvent.dragOver(doneColumn, { dataTransfer, clientY: 0 });
    await waitFor(() => {
      expect(canvas.queryByTestId("drop-placeholder")).not.toBeNull();
    });
  },
};
