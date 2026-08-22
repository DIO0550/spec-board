// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { withBoardCardProvider } from "../../BoardCardProvider/storybook/decorator";
import { TaskCardFooter } from "../TaskCardFooter";
import { TaskCardHeader } from "../TaskCardHeader";
import { TaskCardLabels } from "../TaskCardLabels";
import { TaskCardProgress } from "../TaskCardProgress";
import { TaskCardRoot } from ".";

const task = initialTasks[0];
const children = initialTasks.filter(
  (candidate) => candidate.hierarchy.parentFilePath === task.filePath,
);
const meta = {
  component: TaskCardRoot,
  args: {
    task,
    fromColumn: task.status,
    childTasks: children,
    onClick: fn(),
    children: (
      <>
        <TaskCardHeader />
        <TaskCardLabels />
        <TaskCardProgress />
        <TaskCardFooter />
      </>
    ),
  },
  decorators: [
    withBoardCardProvider({
      tasks: initialTasks,
      allTasks: initialTasks,
      doneColumn: "Done",
      projections: buildProjectionsFixture(initialTasks, "Done"),
    }),
  ],
} satisfies Meta<typeof TaskCardRoot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { hasBrokenLink: true, hasParseError: true },
};
export const EdgeCases: Story = {
  args: {
    task: { ...task, title: "", labels: [], priority: undefined, draft: true },
    childTasks: [],
    children: <TaskCardHeader />,
  },
};

export const Active: Story = {
  args: { active: true },
};
