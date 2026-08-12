import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskForest } from "@/domains/task-forest";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import { ActiveBoardView } from ".";

const taskTree = TaskForest.fromPayload(
  initialTasks.map((task) => ({ filePath: task.filePath, children: [] })),
);
const workspace = {
  columns: initialColumns,
  tasks: initialTasks,
  doneColumn: "Done",
  projections: buildProjectionsFixture(initialTasks, "Done"),
  taskTree,
  milestones: [],
  onAddTask: fn(),
  onTaskClick: fn(),
  onAddColumn: fn(),
  onRenameColumn: fn(),
  onDeleteColumn: fn(),
  onTaskDrop: fn(),
  onColumnReorder: fn(),
};
const meta = {
  component: ActiveBoardView,
  args: {
    viewMode: "board",
    filtered: initialTasks,
    filterActive: false,
    workspace,
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ActiveBoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { viewMode: "calendar", filterActive: true },
};
export const EdgeCases: Story = {
  args: {
    viewMode: "list",
    filtered: [],
    workspace: { ...workspace, tasks: [] },
  },
};
export const Empty: Story = {
  args: {
    viewMode: "tree",
    filtered: [],
    workspace: { ...workspace, tasks: [], taskTree: TaskForest.empty },
  },
};
