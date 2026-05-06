// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Task } from "@/types/task";
import { SubIssueProgress } from ".";

const makeChild = (id: string, status: string, title: string) =>
  Task.fromPayload({
    id,
    title,
    status,
    labels: [],
    parent: "tasks/parent.md",
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/${id}.md`,
  });

const meta: Meta<typeof SubIssueProgress> = {
  component: SubIssueProgress,
  args: {
    childTasks: [],
    doneColumn: "Done",
  },
};

export default meta;

type Story = StoryObj<typeof SubIssueProgress>;

export const Empty: Story = {
  args: { childTasks: [] },
};

export const InProgress: Story = {
  args: {
    childTasks: [
      makeChild("c1", "Done", "完了済み 1"),
      makeChild("c2", "Done", "完了済み 2"),
      makeChild("c3", "Todo", "未完了 1"),
      makeChild("c4", "Todo", "未完了 2"),
    ],
  },
};

export const AllDone: Story = {
  args: {
    childTasks: [
      makeChild("c1", "Done", "完了 1"),
      makeChild("c2", "Done", "完了 2"),
      makeChild("c3", "Done", "完了 3"),
    ],
  },
};
