// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fireEvent, fn, within } from "storybook/test";
import { TaskPathLookup } from "@/domains/task-path-lookup";
import { withDeleteFlowProvider } from "../DeleteFlowProvider/storybook/decorator";
import { withDetailProvider } from "../DetailProvider/storybook/decorator";
import {
  detailAllTasks,
  detailColumns,
  detailProjections,
  detailTask,
  makeDetailTask,
  noopAddLink,
  noopRemoveLink,
} from "../storybook/fixtures";
import { PropertiesSidebar } from ".";

const meta: Meta<typeof PropertiesSidebar> = {
  component: PropertiesSidebar,
  parameters: { layout: "padded" },
  // decorators は配列の後ろが外側になる（DetailProvider > DeleteFlowProvider > 枠 div > Story）。
  decorators: [
    (Story) => (
      <div className="w-[340px] border border-border bg-surface">
        <Story />
      </div>
    ),
    withDeleteFlowProvider({ task: detailTask }),
    withDetailProvider({
      task: detailTask,
      columns: detailColumns,
      allTasks: detailAllTasks,
      projections: detailProjections,
      tasksByNormalizedPath: TaskPathLookup.fromTasks(detailAllTasks),
      onAddSubIssue: fn(),
      onSelectTask: fn(),
      onAddLink: noopAddLink,
      onRemoveLink: noopRemoveLink,
    }),
  ],
  args: {},
};
export default meta;
type Story = StoryObj<typeof PropertiesSidebar>;

export const Default: Story = {};
export const AllProps: Story = { args: { onArchive: fn() } };

/** 親・リンク先が存在しないタスク（lookup に自身しか登録しないので両方 broken 判定になる） */
const brokenTask = makeDetailTask({
  parent: "tasks/missing-parent.md",
  links: ["tasks/missing-link.md"],
  extras: {},
});
// story 側の decorators は meta のものより内側に追加されるため、内側の Provider が勝つ。
export const EdgeCases: Story = {
  decorators: [
    withDeleteFlowProvider({ task: brokenTask }),
    withDetailProvider({
      task: brokenTask,
      columns: detailColumns,
      allTasks: [brokenTask],
      projections: detailProjections,
      tasksByNormalizedPath: TaskPathLookup.fromTasks([brokenTask]),
      onSelectTask: fn(),
      onAddLink: noopAddLink,
    }),
  ],
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement }) => {
    await fireEvent.click(
      within(canvasElement).getByTestId("detail-delete-button"),
    );
  },
};
