// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ParseErrorIcon } from ".";

const meta: Meta<typeof ParseErrorIcon> = {
  component: ParseErrorIcon,
  args: { label: "パースエラーあり", size: 16, className: "text-red-500" },
  argTypes: {
    label: { control: "text" },
    size: { control: { type: "number", min: 8, max: 64 } },
    className: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof ParseErrorIcon>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    label: "frontmatterを解析できません",
    size: 24,
    className: "text-red-600",
  },
};
export const EdgeCases: Story = {
  args: { label: "詳細なエラー情報を確認してください", size: 48 },
};
