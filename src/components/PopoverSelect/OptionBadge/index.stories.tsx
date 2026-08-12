// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OptionBadge } from ".";

const meta: Meta<typeof OptionBadge> = {
  component: OptionBadge,
  args: { label: "High", badgeClassName: "bg-red-100 text-red-800" },
  argTypes: {
    label: { control: "text" },
    badgeClassName: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof OptionBadge>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { label: "Medium", badgeClassName: "bg-yellow-100 text-yellow-800" },
};
export const EdgeCases: Story = {
  args: {
    label: "非常に長い優先度ラベル",
    badgeClassName: "bg-blue-100 text-blue-800",
  },
};
