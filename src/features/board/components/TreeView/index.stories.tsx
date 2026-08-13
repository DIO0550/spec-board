import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskForest } from "@/domains/task-forest";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { TreeView } from ".";

const taskTree = TaskForest.fromPayload([
  {
    filePath: initialTasks[0].filePath,
    children: [{ filePath: initialTasks[2].filePath, children: [] }],
  },
  ...initialTasks
    .slice(1)
    .filter((task) => task.id !== initialTasks[2].id)
    .map((task) => ({ filePath: task.filePath, children: [] })),
]);
const meta = {
  component: TreeView,
  args: {
    tasks: initialTasks,
    taskTree,
    columns: initialColumns,
    projectName: "payments-service",
    doneColumn: "Done",
    onAddTask: fn(),
    onTaskClick: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TreeView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    tasks: initialTasks.map((task, index) => ({
      ...task,
      due: index === 0 ? "2026-09-30" : task.due,
    })),
  },
};
export const EdgeCases: Story = {
  args: { tasks: [initialTasks[0]], taskTree: TaskForest.empty },
};
export const Empty: Story = { args: { tasks: [], taskTree: TaskForest.empty } };
export const Expanded: Story = { args: { defaultExpanded: true } };
export const Collapsed: Story = { args: { defaultExpanded: false } };
export const Done: Story = {
  args: {
    tasks: [initialTasks[3]],
    taskTree: TaskForest.fromPayload([
      { filePath: initialTasks[3].filePath, children: [] },
    ]),
  },
};

const deepTasks = Array.from({ length: 6 }, (_unused, index) => ({
  ...initialTasks[0],
  id: `deep-${index}`,
  title: `深い階層 ${index + 1}`,
  filePath: `tasks/deep-${index}.md`,
  hierarchy: {
    parentFilePath: index === 0 ? undefined : `tasks/deep-${index - 1}.md`,
    childFilePaths: index === 5 ? [] : [`tasks/deep-${index + 1}.md`],
  },
}));
let deepTree = TaskForest.fromPayload([]);
for (let index = deepTasks.length - 1; index >= 0; index -= 1) {
  deepTree = TaskForest.fromPayload([
    { filePath: deepTasks[index].filePath, children: deepTree },
  ]);
}
export const DeepNesting: Story = {
  args: { tasks: deepTasks, taskTree: deepTree },
};
