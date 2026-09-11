// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelDefinition } from "@/domains/label-definition";
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
import { DetailFields } from ".";

const labelSuggestions = LabelDefinition.listFromWire([
  { name: "bug", color: "red" },
  { name: "feature", color: "blue" },
  { name: "docs" },
]);

const meta: Meta<typeof DetailFields> = {
  component: DetailFields,
  decorators: [
    withDetailProvider({
      task: detailTask,
      columns: detailColumns,
      allTasks: detailAllTasks,
      projections: detailProjections,
      labelSuggestions,
      onAddSubIssue: fn(),
      onAddLink: noopAddLink,
      onRemoveLink: noopRemoveLink,
    }),
  ],
  args: { children: null },
};
export default meta;
type Story = StoryObj<typeof DetailFields>;

export const Default: Story = {
  render: () => (
    <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
    </DetailFields>
  ),
};
export const AllProps: Story = {
  render: () => (
    <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
      <DetailFields.SubIssue />
      <DetailFields.Links />
    </DetailFields>
  ),
};
export const EdgeCases: Story = {
  decorators: [
    withDetailProvider({
      task: makeDetailTask({ draft: true, labels: [], priority: undefined }),
      columns: detailColumns,
      labelSuggestions,
    }),
  ],
  render: () => (
    <DetailFields>
      <DetailFields.StatusPriority />
      <DetailFields.Labels />
      <DetailFields.Draft />
    </DetailFields>
  ),
};
