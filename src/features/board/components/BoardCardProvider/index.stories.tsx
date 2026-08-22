// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { TaskCard } from "../TaskCard";
import { BoardCardProvider } from ".";

const task = initialTasks[0];
const children = (
  <div className="w-72">
    <TaskCard task={task} fromColumn={task.status} onClick={fn()} />
  </div>
);
const meta = {
  component: BoardCardProvider,
  args: {
    tasks: initialTasks,
    allTasks: initialTasks,
    doneColumn: "Done",
    projections: buildProjectionsFixture(initialTasks, "Done"),
    onTaskDrop: fn(),
    children,
  },
} satisfies Meta<typeof BoardCardProvider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    dndDisabled: true,
    milestonesByName: new Map([
      ["v1.0", { name: "v1.0", title: "正式リリース" }],
    ]),
  },
};
export const EdgeCases: Story = {
  args: {
    tasks: [],
    allTasks: [],
    projections: buildProjectionsFixture([], "Done"),
    children: (
      <p className="text-sm text-muted">Provider内にタスクがありません</p>
    ),
  },
};
