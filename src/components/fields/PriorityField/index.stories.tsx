// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PriorityField } from ".";

const meta: Meta<typeof PriorityField> = {
  component: PriorityField,
  args: {
    onChange: fn(),
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof PriorityField>;

export const Selected: Story = {
  args: {
    value: "High",
  },
};

export const Unselected: Story = {
  args: {
    value: undefined,
  },
};

export const Disabled: Story = {
  args: {
    value: "Medium",
    disabled: true,
  },
};
