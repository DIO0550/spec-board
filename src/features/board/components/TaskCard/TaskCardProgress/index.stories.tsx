import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { BoardCardProvider } from "../../BoardCardProvider";
import { TaskCardRoot } from "../TaskCardRoot";
import { TaskCardProgress } from ".";

const root = initialTasks[0];
const children = initialTasks.filter(
  (task) => task.hierarchy.parentFilePath === root.filePath,
);
const withProgress =
  (childTasks: typeof initialTasks) => (Story: () => React.JSX.Element) => (
    <BoardCardProvider
      tasks={initialTasks}
      allTasks={initialTasks}
      doneColumn="Done"
      projections={buildProjectionsFixture(initialTasks, "Done")}
    >
      <TaskCardRoot
        task={root}
        fromColumn={root.status}
        childTasks={childTasks}
      >
        <Story />
      </TaskCardRoot>
    </BoardCardProvider>
  );
const meta = {
  component: TaskCardProgress,
  decorators: [withProgress(children)],
} satisfies Meta<typeof TaskCardProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { decorators: [withProgress(children)] };
export const EdgeCases: Story = { decorators: [withProgress([])] };
