import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskFormFooter } from ".";

const meta = {
  component: TaskFormFooter,
  args: {
    saveHint: "保存先: tasks/search-pagination.md",
    canSubmit: true,
    isSubmitting: false,
    onCancel: fn(),
    onSubmit: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TaskFormFooter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: { saveHint: `保存先: tasks/${"very-long-path-".repeat(12)}.md` },
};
export const Empty: Story = {
  args: { saveHint: "タイトルを入力してください", canSubmit: false },
};
export const Submitting: Story = { args: { isSubmitting: true } };
export const ErrorState: Story = {
  name: "Error",
  args: {
    saveHint: "ファイル名に使用できない文字が含まれています",
    canSubmit: false,
  },
};
