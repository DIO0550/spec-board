import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TITLE_MAX_LENGTH } from "@/features/task-form/lib/fields/title";
import { TaskFormSubIssues } from ".";

const meta = {
  component: TaskFormSubIssues,
  args: { value: "APIを実装\nUIテストを追加", disabled: false, onChange: fn() },
} satisfies Meta<typeof TaskFormSubIssues>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    value: Array.from(
      { length: 20 },
      (_, index) => `サブIssue ${index + 1}`,
    ).join("\n"),
  },
};
export const Empty: Story = { args: { value: "" } };
export const Filled: Story = {};
export const ErrorState: Story = {
  name: "Error",
  args: {
    value: `正常\n${"a".repeat(TITLE_MAX_LENGTH + 1)}`,
    error: {
      line: 2,
      error: {
        code: "TOO_LONG",
        max: TITLE_MAX_LENGTH,
        actual: TITLE_MAX_LENGTH + 1,
      },
    },
  },
};
export const Submitting: Story = { args: { disabled: true } };
