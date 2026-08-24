import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { initialTasks } from "@/test-fixtures";
import { TreeNodeItem } from ".";

const root = initialTasks[0];
const child = initialTasks[2];
const node = {
  filePath: root.filePath,
  children: [{ filePath: child.filePath, children: [] }],
};
const tasksByFilePath = new Map(
  initialTasks.map((task) => [task.filePath, task]),
);
const meta = {
  component: TreeNodeItem,
  args: { node, depth: 0, tasksByFilePath, onSelect: fn() },
  decorators: [
    (Story) => (
      <ul>
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof TreeNodeItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { args: { depth: 2 } };
export const EdgeCases: Story = {
  args: {
    node: { filePath: taskFilePathFixture("missing.md"), children: [] },
    tasksByFilePath: new Map(),
  },
};
export const Expanded: Story = { args: { expanded: true } };
export const Collapsed: Story = { args: { expanded: false } };
export const Done: Story = {
  args: {
    node: { filePath: initialTasks[3].filePath, children: [] },
    tasksByFilePath,
  },
};
