// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { CycleWarningBanner } from ".";

const basePayload: TaskFromPayloadInput = {
  id: "task-1",
  title: "サンプル",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/sample.md",
  extras: {},
  warnings: [],
};

const meta: Meta<typeof CycleWarningBanner> = {
  title: "features/detail/CycleWarningBanner",
  component: CycleWarningBanner,
};
export default meta;

type Story = StoryObj<typeof CycleWarningBanner>;

export const Default: Story = {
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [
        {
          code: "parentCycle",
          field: "parent",
          message: "parent chain forms a cycle",
        },
      ],
    }),
  },
};

export const NoWarning: Story = {
  args: {
    task: Task.fromPayload(basePayload),
  },
};

export const MultipleWarnings: Story = {
  args: {
    task: Task.fromPayload({
      ...basePayload,
      warnings: [
        {
          code: "parentCycle",
          field: "parent",
          message: "parent chain forms a cycle",
        },
        {
          code: "parentNotFound",
          field: "parent",
          message: "parent task was not found",
        },
      ],
    }),
  },
};
