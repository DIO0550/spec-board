import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { BoardCardProvider } from "../../BoardCardProvider";
import { TaskCardRoot } from "../TaskCardRoot";
import { TaskCardHeader } from ".";

const baseTask = initialTasks[0];
const meta = {
  component: TaskCardHeader,
  decorators: [
    (Story) => (
      <BoardCardProvider
        tasks={initialTasks}
        allTasks={initialTasks}
        projections={buildProjectionsFixture(initialTasks, "Done")}
        doneColumn="Done"
      >
        <TaskCardRoot
          task={baseTask}
          fromColumn={baseTask.status}
          onClick={fn()}
        >
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>
    ),
  ],
} satisfies Meta<typeof TaskCardHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  decorators: [
    (Story) => (
      <BoardCardProvider
        tasks={initialTasks}
        allTasks={initialTasks}
        projections={buildProjectionsFixture(initialTasks, "Done")}
      >
        <TaskCardRoot
          task={{ ...baseTask, draft: true, due: "2026-09-30" }}
          fromColumn={baseTask.status}
          hasBrokenLink
          hasParseError
        >
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>
    ),
  ],
};
export const EdgeCases: Story = {
  decorators: [
    (Story) => (
      <BoardCardProvider
        tasks={initialTasks}
        allTasks={initialTasks}
        projections={buildProjectionsFixture(initialTasks, "Done")}
      >
        <TaskCardRoot
          task={{ ...baseTask, title: "", priority: undefined, due: undefined }}
          fromColumn={baseTask.status}
        >
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>
    ),
  ],
};
