import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import { BoardView } from ".";

const meta = {
  component: BoardView,
  args: {
    columns: initialColumns,
    filtered: initialTasks,
    allTasks: initialTasks,
    filterActive: false,
    doneColumn: "Done",
    projections: buildProjectionsFixture(initialTasks, "Done"),
    onAddTask: fn(),
    onTaskClick: fn(),
    onAddColumn: fn(),
    onRenameColumn: fn(),
    onDeleteColumn: fn(),
    onTaskDrop: fn(),
    onColumnReorder: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    filterActive: true,
    milestonesByName: new Map([
      ["v1.0", { name: "v1.0", title: "正式リリース" }],
    ]),
  },
};
export const EdgeCases: Story = {
  args: {
    columns: [{ name: "Todo", order: 0 }],
    filtered: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
  },
};
export const Empty: Story = {
  args: {
    filtered: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
  },
};
