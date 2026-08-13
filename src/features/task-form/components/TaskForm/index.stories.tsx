// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { TaskForm } from ".";

const meta: Meta<typeof TaskForm> = {
  component: TaskForm,
  args: {
    columns: initialColumns,
    initialStatus: "Todo",
    onSubmit: fn(),
    onCancel: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof TaskForm>;

export const Default: Story = {};

export const AllProps: Story = {
  args: {
    parentCandidates: initialTasks,
    existingTasks: initialTasks,
    submitLabel: "タスクを作成",
    cancelLabel: "キャンセル",
  },
};

export const EdgeCases: Story = {
  args: { columns: [{ name: "非常に長いステータス名".repeat(4), order: 0 }] },
};

export const Empty: Story = {};

export const Filled: Story = {
  args: { parentCandidates: initialTasks, existingTasks: initialTasks },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByTestId("task-form-title"),
      "入力済みタスク",
    );
    await userEvent.type(canvas.getByTestId("task-form-body"), "Markdown本文");
  },
};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const WithParentCandidates: Story = {
  args: { parentCandidates: initialTasks },
};

export const WithPathPreview: Story = {
  args: {
    existingTasks: initialTasks,
  },
};
