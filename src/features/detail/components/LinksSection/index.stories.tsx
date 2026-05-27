// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";
import { LinksSection } from ".";

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: "サンプル",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

const self = makeTask({
  id: "self",
  title: "自タスク",
  filePath: "tasks/self.md",
});
const linkedA = makeTask({
  id: "linked-a",
  title: "リンク先 A",
  filePath: "tasks/linked-a.md",
});
const reverseA = makeTask({
  id: "rev-a",
  title: "リンク元 A",
  filePath: "tasks/reverse-a.md",
});
const candidate = makeTask({
  id: "c",
  title: "候補タスク",
  filePath: "tasks/candidate.md",
});

const noopAddLink = async () => Result.ok(self);
const noopRemoveLink = async () => Result.ok(self);

const meta: Meta<typeof LinksSection> = {
  component: LinksSection,
  parameters: { layout: "padded" },
  args: {
    task: self,
    allTasks: [self, candidate],
    parentFilePath: null,
    childrenFilePaths: [],
    onAddLink: noopAddLink,
    onRemoveLink: noopRemoveLink,
    onLinkClick: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof LinksSection>;

export const NoLinks: Story = {};

export const WithLinks: Story = {
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"],
    }),
    allTasks: [self, linkedA, candidate],
  },
};

export const WithReverseLinks: Story = {
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      reverseLinks: ["tasks/reverse-a.md"],
    }),
    allTasks: [self, reverseA, candidate],
  },
};

export const WithBothDirections: Story = {
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"],
      reverseLinks: ["tasks/reverse-a.md"],
    }),
    allTasks: [self, linkedA, reverseA, candidate],
  },
};

export const NavigationDisabled: Story = {
  args: {
    task: makeTask({
      id: "self",
      title: "自タスク",
      filePath: "tasks/self.md",
      links: ["tasks/linked-a.md"],
      reverseLinks: ["tasks/reverse-a.md"],
    }),
    allTasks: [self, linkedA, reverseA, candidate],
    onLinkClick: undefined,
  },
};
