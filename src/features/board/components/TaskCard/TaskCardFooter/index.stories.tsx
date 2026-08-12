import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { BoardCardProvider } from "../../BoardCardProvider";
import { TaskCardRoot } from "../TaskCardRoot";
import { TaskCardFooter } from ".";

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
  component: TaskCardFooter,
  decorators: [withTask(baseTask)],
} satisfies Meta<typeof TaskCardFooter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  decorators: [
    withTask({
      ...baseTask,
      id: "tasks/very-long-feature-name.md",
      links: { ...baseTask.links, linkedFilePaths: ["one.md", "two.md"] },
    }),
  ],
};
export const EdgeCases: Story = {
  decorators: [
    withTask({
      ...baseTask,
      id: "task",
      links: { linkedFilePaths: [], reverseLinkedFilePaths: [] },
      hierarchy: { parentFilePath: undefined, childFilePaths: [] },
    }),
  ],
};
