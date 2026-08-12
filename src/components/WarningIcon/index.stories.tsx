// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WarningIcon } from ".";

const meta: Meta<typeof WarningIcon> = {
  component: WarningIcon,
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof WarningIcon>;

export const Default: Story = {};

export const WithCustomLabel: Story = {
  args: {
    label: "壊れたリンク",
  },
};

export const LargeSize: Story = {
  args: {
    size: 48,
  },
};

export const AllProps: Story = { ...WithCustomLabel };
export const EdgeCases: Story = { ...LargeSize };
