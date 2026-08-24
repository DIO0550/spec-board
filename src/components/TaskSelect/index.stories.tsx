// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { Task, type TaskPayload } from "@/types/task";
import { TaskSelect } from ".";

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.filePath ?? "id",
    title: "サンプルタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: taskFilePathFixture("tasks/x.md"),
    ...overrides,
  });

const TASKS: Task[] = [
  makeTask({
    id: "t-1",
    title: "ログイン修正",
    filePath: taskFilePathFixture("tasks/login.md"),
  }),
  makeTask({
    id: "t-2",
    title: "検索機能追加",
    filePath: taskFilePathFixture("tasks/search.md"),
  }),
  makeTask({
    id: "t-3",
    title: "通知バッジ",
    filePath: taskFilePathFixture("tasks/badge.md"),
  }),
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
    excludeFilePaths: [taskFilePathFixture("tasks/login.md")],
  },
};

export const WithSelected: Story = {
  args: {
    value: taskFilePathFixture("tasks/login.md"),
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
    value: taskFilePathFixture("tasks/login.md"),
  },
};

export const AutoFocus: Story = {
  args: {
    autoFocus: true,
    testIdPrefix: "links-section",
  },
};

export const AllProps: Story = { ...WithSelected };
export const EdgeCases: Story = { ...Empty };

export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("task-select-input"),
    );
  },
};
