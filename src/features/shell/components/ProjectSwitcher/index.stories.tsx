// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ProjectSwitcher } from ".";

const recentProjects = [
  { path: "/workspace/spec-board", name: "spec-board" },
  { path: "/workspace/design-system", name: "design-system" },
  { path: "/workspace/product-docs", name: "product-docs" },
] as const;

const meta: Meta<typeof ProjectSwitcher> = {
  component: ProjectSwitcher,
  args: {
    projectName: "spec-board",
    currentPath: "/workspace/spec-board",
    recentProjects,
    onOpenProject: fn(),
    onOpenProjectPath: fn(),
  },
  argTypes: {
    projectName: { control: "text" },
    currentPath: { control: "text" },
    recentProjects: { control: "object" },
    onOpenProject: { control: false },
    onOpenProjectPath: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-60 border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProjectSwitcher>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    projectName: "非常に長いプロジェクト名で省略表示を確認するプロジェクト",
    currentPath: "/workspace/current",
    recentProjects: [
      {
        path: "/workspace/a/very/deeply/nested/project/path",
        name: "非常に長い最近のプロジェクト名",
      },
    ],
  },
};
export const Empty: Story = {
  args: { projectName: undefined, currentPath: undefined, recentProjects: [] },
};
