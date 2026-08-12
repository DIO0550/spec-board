// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  detailChildInfo,
  detailColumns,
  detailHandlers,
  detailTask,
  idleDeleteFlow,
  makeDetailTask,
  noBrokenLinks,
  noopAddLink,
  noopRemoveLink,
  parentTask,
} from "../storybook/fixtures";
import { PropertiesSidebar } from ".";

const meta: Meta<typeof PropertiesSidebar> = {
  component: PropertiesSidebar,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="w-[340px] border border-border bg-surface">
        <Story />
      </div>
    ),
  ],
  args: {
    task: detailTask,
    columns: detailColumns,
    allTasks: [parentTask, detailTask, ...detailChildInfo.childTasks],
    childInfo: detailChildInfo,
    parentTask,
    brokenLinks: noBrokenLinks,
    handlers: detailHandlers,
    deleteFlow: idleDeleteFlow,
    orphanStrategy: "clear",
    onOrphanStrategyChange: () => {},
    onAddSubIssue: () => {},
    onSelectTask: () => {},
    onAddLink: noopAddLink,
    onRemoveLink: noopRemoveLink,
  },
};
export default meta;
type Story = StoryObj<typeof PropertiesSidebar>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    task: makeDetailTask({
      parent: "tasks/missing-parent.md",
      links: ["tasks/missing-link.md"],
      extras: {},
    }),
    parentTask: null,
    brokenLinks: {
      ...noBrokenLinks,
      parent: true,
      links: new Set(["tasks/missing-link.md"]),
    },
  },
};
export const DeleteConfirmation: Story = {
  args: {
    deleteFlow: { ...idleDeleteFlow, isOpen: true },
  },
};
