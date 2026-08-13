import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskForest } from "@/domains/task-forest";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import { BoardWorkspace } from ".";

const taskTree = TaskForest.fromPayload(
  initialTasks.map((task) => ({ filePath: task.filePath, children: [] })),
);
const meta = {
  component: BoardWorkspace,
  args: {
    columns: initialColumns,
    tasks: initialTasks,
    doneColumn: "Done",
    projections: buildProjectionsFixture(initialTasks, "Done"),
    taskTree,
    milestones: [{ name: "v1.0", title: "正式リリース" }],
    milestonesByName: new Map(),
    onAddTask: fn(),
    onTaskClick: fn(),
    onAddColumn: fn(),
    onRenameColumn: fn(),
    onDeleteColumn: fn(),
    onTaskDrop: fn(),
    onColumnReorder: fn(),
    onLabelFilterApplied: fn(),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BoardWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { args: { initialLabelFilter: "frontend" } };
export const EdgeCases: Story = {
  args: {
    columns: [],
    tasks: [],
    taskTree: TaskForest.empty,
    projections: buildProjectionsFixture([], "Done"),
    milestones: [],
  },
};
export const Empty: Story = {
  args: {
    tasks: [],
    taskTree: TaskForest.empty,
    projections: buildProjectionsFixture([], "Done"),
  },
};
