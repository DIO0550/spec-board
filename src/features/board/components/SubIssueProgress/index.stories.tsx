// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubIssueProgress, type SubIssueRow } from ".";

const makeRow = (key: string, label: string, isDone: boolean): SubIssueRow => ({
  key,
  label,
  isDone,
});

const directChildRows: SubIssueRow[] = [
  makeRow("c1", "完了済み 1", true),
  makeRow("c2", "完了済み 2", true),
  makeRow("c3", "未完了 1", false),
  makeRow("c4", "未完了 2", false),
];

const meta: Meta<typeof SubIssueProgress> = {
  component: SubIssueProgress,
  args: {
    childRows: [],
    counts: { done: 0, total: 0 },
  },
};

export default meta;

type Story = StoryObj<typeof SubIssueProgress>;

export const Empty: Story = {
  args: { childRows: [], counts: { done: 0, total: 0 } },
};

export const InProgress: Story = {
  args: { childRows: directChildRows, counts: { done: 2, total: 4 } },
};

export const AllDone: Story = {
  args: {
    childRows: [
      makeRow("c1", "完了 1", true),
      makeRow("c2", "完了 2", true),
      makeRow("c3", "完了 3", true),
    ],
    counts: { done: 3, total: 3 },
  },
};

export const WithDescendantsBeyondDirectChildren: Story = {
  args: { childRows: directChildRows, counts: { done: 3, total: 7 } },
};

export const Default: Story = { ...InProgress };
export const AllProps: Story = { ...WithDescendantsBeyondDirectChildren };
export const EdgeCases: Story = { ...Empty };
