// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskPathLookup } from "@/domains/task-path-lookup";
import { buildProjectionsFixture } from "@/test-fixtures";
import { Result } from "@/utils/result";
import {
  childTask,
  detailColumns,
  detailTask,
  makeDetailTask,
  parentTask,
} from "../storybook/fixtures";
import { DetailScreen } from ".";

const allTasks = [parentTask, detailTask, childTask];
const meta: Meta<typeof DetailScreen> = {
  component: DetailScreen,
  parameters: { layout: "fullscreen" },
  args: {
    task: detailTask,
    columns: detailColumns,
    allTasks,
    projections: buildProjectionsFixture(allTasks, "Done"),
    tasksByNormalizedPath: TaskPathLookup.fromTasks(allTasks),
    onBack: fn(),
    onTaskUpdate: fn(),
    onDelete: fn(),
    onAddSubIssue: fn(),
    onSelectTask: fn(),
    onAddLink: async () => Result.ok(detailTask),
    onRemoveLink: async () => Result.ok(detailTask),
  },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[540px]">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DetailScreen>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    task: makeDetailTask({
      title: "狭いviewportでも崩れずに折り返す非常に長いIssueタイトル",
      body: "",
      labels: [],
      priority: undefined,
      due: undefined,
      children: [],
      links: [],
      extras: {},
    }),
  },
};
export const Draft: Story = {
  args: { task: makeDetailTask({ draft: true }) },
};
export const BrokenAndWarnings: Story = {
  args: {
    task: makeDetailTask({
      parent: "tasks/missing-parent.md",
      links: ["tasks/missing-link.md"],
      warnings: [
        { code: "parentCycle", field: "parent", message: "cycle" },
        {
          code: "invalidStatusUsedDefault",
          field: "status",
          message: "invalid",
        },
      ],
    }),
  },
};
