// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Task } from "@/types/task";
import { AppSidebar } from ".";

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
  makeTask("task-2", "検索結果を整える", "features/search/results.md"),
  makeTask("task-3", "リリース手順を更新", "docs/release.md"),
];

const meta: Meta<typeof AppSidebar> = {
  component: AppSidebar,
  parameters: { layout: "fullscreen" },
  args: {
    projectName: "spec-board",
    currentPath: "/workspace/spec-board",
    recentProjects: [
      { path: "/workspace/spec-board", name: "spec-board" },
      { path: "/workspace/design-system", name: "design-system" },
    ],
    tasks,
    selectedTaskId: "task-2",
    onOpenProject: fn(),
    onOpenProjectPath: fn(),
    onSelectTask: fn(),
  },
  argTypes: {
    projectName: { control: "text" },
    currentPath: { control: "text" },
    recentProjects: { control: "object" },
    tasks: { control: "object" },
    selectedTaskId: { control: "text" },
    onOpenProject: { control: false },
    onOpenProjectPath: { control: false },
    onSelectTask: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen bg-bg">
        <Story />
        <main className="flex-1 p-6 text-sm text-muted">コンテンツ領域</main>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AppSidebar>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    projectName: "非常に長いプロジェクト名で省略表示を確認する",
    currentPath: "/workspace/long-project",
    recentProjects: [
      {
        path: "/workspace/a/very/deeply/nested/recent-project",
        name: "非常に長い最近のプロジェクト名",
      },
    ],
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
export const Empty: Story = {
  args: {
    projectName: undefined,
    currentPath: undefined,
    recentProjects: [],
    tasks: [],
    selectedTaskId: undefined,
  },
};
