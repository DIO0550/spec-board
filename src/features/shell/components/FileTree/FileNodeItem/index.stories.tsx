// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  taskFilePathFixture,
  taskIdFixture,
} from "@/domains/__tests__/taskFixtures";
import type { FileTreeNode } from "@/features/shell/lib/buildFileTree";
import { Task } from "@/types/task";
import { FileNodeItem } from ".";

const makeTask = (id: string, title: string, filePath: string) =>
  Task.fromPayload({
    id,
    title,
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath,
  });

const task = makeTask(
  "task-1",
  "ログイン画面を改善",
  taskFilePathFixture("tasks/login.md"),
);
const fileNode: FileTreeNode = { kind: "file", name: "login.md", task };
const directoryNode: FileTreeNode = {
  kind: "dir",
  name: "features",
  path: "features",
  children: [
    fileNode,
    {
      kind: "file",
      name: "search.md",
      task: makeTask("task-2", "検索を追加", "features/search.md"),
    },
  ],
};

const meta: Meta<typeof FileNodeItem> = {
  component: FileNodeItem,
  args: {
    node: fileNode,
    depth: 0,
    selectedTaskId: undefined,
    onSelect: fn(),
  },
  argTypes: {
    node: { control: "object" },
    depth: { control: { type: "number", min: 0 } },
    selectedTaskId: { control: "text" },
    onSelect: { control: false },
  },
  decorators: [
    (Story) => (
      <ul className="w-64 border border-border bg-surface py-1">
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FileNodeItem>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    node: directoryNode,
    depth: 1,
    selectedTaskId: taskIdFixture("task-1"),
  },
};
export const EdgeCases: Story = {
  args: {
    node: {
      kind: "file",
      name: "a-very-long-task-file-name-that-needs-truncation.md",
      task: makeTask(
        "long",
        "非常に長いタスクタイトルがツリーの横幅を超える状態",
        "deep/path/a-very-long-task-file-name-that-needs-truncation.md",
      ),
    },
    depth: 6,
    selectedTaskId: taskIdFixture("long"),
  },
};
