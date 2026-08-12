import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { BoardCardProvider } from "../../BoardCardProvider";
import { TaskCardRoot } from "../TaskCardRoot";
import { TaskCardLabels } from ".";

const baseTask = initialTasks[0];
const withTask =
  (task: typeof baseTask) => (Story: () => React.JSX.Element) => (
    <BoardCardProvider
      tasks={initialTasks}
      allTasks={initialTasks}
      projections={buildProjectionsFixture(initialTasks, "Done")}
    >
      <TaskCardRoot task={task} fromColumn={task.status}>
        <Story />
      </TaskCardRoot>
    </BoardCardProvider>
  );
const meta = {
  component: TaskCardLabels,
  decorators: [withTask(baseTask)],
} satisfies Meta<typeof TaskCardLabels>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  decorators: [
    withTask({
      ...baseTask,
      labels: ["bug", "frontend", "urgent", "accessibility"],
    }),
  ],
};
export const EdgeCases: Story = {
  decorators: [withTask({ ...baseTask, labels: [] })],
};
