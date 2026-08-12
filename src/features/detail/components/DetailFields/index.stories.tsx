// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  detailChildInfo,
  detailColumns,
  detailHandlers,
  detailTask,
  makeDetailTask,
  noopAddLink,
  noopRemoveLink,
} from "../storybook/fixtures";
import { DetailFields } from ".";

const meta: Meta<typeof DetailFields> = {
  component: DetailFields,
  args: {
    task: detailTask,
    columns: detailColumns,
    handlers: detailHandlers,
    children: null,
  },
};
export default meta;
type Story = StoryObj<typeof DetailFields>;

export const Default: Story = {
  render: (args) => (
    <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>
  ),
};
export const AllProps: Story = {
  render: (args) => (
    <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
      <DetailFields.SubIssue
        childInfo={detailChildInfo}
        brokenChildPaths={new Set()}
        onAddSubIssue={() => {}}
      />
      <DetailFields.Links
        allTasks={[detailTask, ...detailChildInfo.childTasks]}
        parentFilePath={null}
        childrenFilePaths={detailChildInfo.childTasks.map(
          (task) => task.filePath,
        )}
        brokenLinkPaths={new Set()}
        brokenReverseLinkPaths={new Set()}
        onAddLink={noopAddLink}
        onRemoveLink={noopRemoveLink}
      />
    </DetailFields>
  ),
};
export const EdgeCases: Story = {
  args: {
    task: makeDetailTask({ draft: true, labels: [], priority: undefined }),
  },
  render: (args) => (
    <DetailFields {...args}>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
    </DetailFields>
  ),
};
