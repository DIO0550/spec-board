// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { detailTask, makeDetailTask } from "../storybook/fixtures";
import { DetailBody } from ".";

const meta: Meta<typeof DetailBody> = {
  component: DetailBody,
  args: {
    task: detailTask,
    subIssueCounts: { done: 1, total: 2 },
    onTitleConfirm: fn(),
    onBodyConfirm: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof DetailBody>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    task: makeDetailTask({
      title: "狭い画面でも自然に折り返す非常に長いIssueタイトルと空の本文",
      body: "",
      due: undefined,
      children: [],
      extras: {},
    }),
    subIssueCounts: { done: 0, total: 0 },
  },
};
export const Warnings: Story = {
  args: {
    task: makeDetailTask({
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
