// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { TaskSelect } from ".";

const makeTask = (overrides: Partial<TaskFromPayloadInput>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: "サンプルタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/x.md",
    ...overrides,
  });

const TASKS: Task[] = [
  makeTask({ id: "t-1", title: "ログイン修正", filePath: "tasks/login.md" }),
  makeTask({ id: "t-2", title: "検索機能追加", filePath: "tasks/search.md" }),
  makeTask({ id: "t-3", title: "通知バッジ", filePath: "tasks/badge.md" }),
];

const meta: Meta<typeof TaskSelect> = {
  component: TaskSelect,
  parameters: { layout: "centered" },
  args: {
    tasks: TASKS,
    value: null,
    onChange: () => {},
    label: "タスク",
  },
};

export default meta;

type Story = StoryObj<typeof TaskSelect>;

export const Default: Story = {};

export const WithExclusions: Story = {
  args: {
    excludeFilePaths: ["tasks/login.md"],
  },
};

export const WithSelected: Story = {
  args: {
    value: "tasks/login.md",
  },
};

export const Empty: Story = {
  args: {
    tasks: [],
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const ReadOnly: Story = {
  args: {
    readOnly: true,
    value: "tasks/login.md",
  },
};

export const AutoFocus: Story = {
  args: {
    autoFocus: true,
    testIdPrefix: "links-section",
  },
};
