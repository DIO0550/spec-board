// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Task } from "@/types/task";
import { FileTree } from ".";

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

const tasks = [
  makeTask("task-1", "ログイン画面を改善", "features/auth/login.md"),
  makeTask("task-2", "パスワード再設定", "features/auth/password-reset.md"),
  makeTask("task-3", "検索結果を整える", "features/search/results.md"),
  makeTask("task-4", "READMEを更新", "README.md"),
];

const meta: Meta<typeof FileTree> = {
  component: FileTree,
  args: { tasks, selectedTaskId: "task-2", onSelectTask: fn() },
  argTypes: {
    tasks: { control: "object" },
    selectedTaskId: { control: "text" },
    onSelectTask: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-64 border border-border bg-surface py-1">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FileTree>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    tasks: [
      makeTask(
        "long-task",
        "非常に長いタスクタイトル",
        "very/deep/nested/directory/a-very-long-task-file-name.md",
      ),
    ],
    selectedTaskId: "long-task",
  },
};
export const Empty: Story = { args: { tasks: [], selectedTaskId: undefined } };
