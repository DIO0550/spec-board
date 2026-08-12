import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildProjectionsFixture, initialTasks } from "@/test-fixtures";
import { BoardCardProvider } from "../../BoardCardProvider";
import { TaskCardRoot } from "../TaskCardRoot";
import { TaskCardMilestone } from ".";

const baseTask = initialTasks[0];
const milestones = new Map([
  ["v1.0", { name: "v1.0", title: "正式リリース", due: "2026-09-30" }],
]);
const withMilestone =
  (milestone: string | undefined) => (Story: () => React.JSX.Element) => {
    const task = { ...baseTask, milestone };
    return (
      <BoardCardProvider
        tasks={initialTasks}
        allTasks={initialTasks}
        milestonesByName={milestones}
        projections={buildProjectionsFixture(initialTasks, "Done")}
      >
        <TaskCardRoot task={task} fromColumn={task.status}>
          <Story />
        </TaskCardRoot>
      </BoardCardProvider>
    );
  };
const meta = {
  component: TaskCardMilestone,
  decorators: [withMilestone("v1.0")],
} satisfies Meta<typeof TaskCardMilestone>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { decorators: [withMilestone("v1.0")] };
export const EdgeCases: Story = { decorators: [withMilestone(undefined)] };
