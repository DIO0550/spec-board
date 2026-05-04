// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { TaskForm } from ".";

const meta: Meta<typeof TaskForm> = {
  component: TaskForm,
  args: {
    columns: initialColumns,
    initialStatus: "Todo",
    onSubmit: () => {},
    onCancel: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskForm>;

export const Default: Story = {};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const WithParentCandidates: Story = {
  args: { parentCandidates: initialTasks },
};
