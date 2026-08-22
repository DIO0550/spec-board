import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import { Board } from "../Board";
import { BoardProviders } from ".";

/** Provider 配下へ差し込むボード本体。 */
const board = (
  <Board>
    {initialColumns.map((column, index) => (
      <Board.Column
        key={column.name}
        name={column.name}
        order={index}
        onAddTask={fn()}
        onTaskClick={fn()}
      />
    ))}
  </Board>
);
const meta = {
  component: BoardProviders,
  args: {
    columns: initialColumns,
    tasks: initialTasks,
    allTasks: initialTasks,
    doneColumn: "Done",
    projections: buildProjectionsFixture(initialTasks, "Done"),
    onTaskDrop: fn(),
    onColumnReorder: fn(),
    children: board,
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BoardProviders>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { dndDisabled: true, milestonesByName: new Map() },
};
export const EdgeCases: Story = {
  args: {
    columns: [],
    tasks: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
    children: <p className="p-4 text-sm text-muted">空のProvider</p>,
  },
};
