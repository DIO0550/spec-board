// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/test-fixtures";
import { Task } from "@/types/task";
import { withBoardCardProvider } from "../BoardCardProvider/decorator";
import { withBoardColumnProvider } from "../BoardColumnProvider/decorator";
import { Column } from ".";

const todoTasks = initialTasks.filter((t) => t.status === "Todo");

const meta: Meta<typeof Column> = {
  component: Column,
  parameters: {
    layout: "centered",
  },
  decorators: [
    withBoardColumnProvider({
      columns: [
        { name: "Todo", order: 0 },
        { name: "In Progress", order: 1 },
        { name: "Done", order: 2 },
      ],
      tasks: todoTasks,
      allTasks: initialTasks,
    }),
    withBoardCardProvider({
      tasks: todoTasks,
      allTasks: initialTasks,
      tasksByNormalizedPath: new Map(),
      milestonesByName: new Map(),
      doneColumn: "Done",
    }),
  ],
  args: {
    name: "Todo",
    onAddClick: () => {},
    onTaskClick: () => {},
    onRename: () => {},
    onDelete: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Column>;

export const Default: Story = {};

const emptyDecorators = [
  withBoardColumnProvider({
    columns: [
      { name: "Todo", order: 0 },
      { name: "In Progress", order: 1 },
      { name: "Done", order: 2 },
    ],
    tasks: [],
    allTasks: [],
  }),
  withBoardCardProvider({
    tasks: [],
    allTasks: [],
    tasksByNormalizedPath: new Map(),
    milestonesByName: new Map(),
    doneColumn: "Done",
  }),
];

export const Empty: Story = {
  decorators: emptyDecorators,
};

const manyTasks = Array.from({ length: 12 }, (_, i) =>
  Task.fromPayload({
    id: `many-${i}`,
    title: `タスク ${i + 1}`,
    status: "Todo",
    priority: i % 3 === 0 ? "High" : i % 3 === 1 ? "Medium" : "Low",
    labels: i % 2 === 0 ? ["sample"] : [],
    parent: undefined,
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/many-${i}.md`,
  }),
);

export const ManyTasks: Story = {
  decorators: [
    withBoardColumnProvider({
      columns: [
        { name: "Todo", order: 0 },
        { name: "In Progress", order: 1 },
        { name: "Done", order: 2 },
      ],
      tasks: manyTasks,
      allTasks: manyTasks,
    }),
    withBoardCardProvider({
      tasks: manyTasks,
      allTasks: manyTasks,
      tasksByNormalizedPath: new Map(),
      milestonesByName: new Map(),
      doneColumn: "Done",
    }),
  ],
};

export const WithoutMenu: Story = {
  args: { onDelete: undefined, onRename: undefined },
};
