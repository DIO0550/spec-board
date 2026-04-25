// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskFormPriority } from ".";

const meta: Meta<typeof TaskFormPriority> = {
  component: TaskFormPriority,
  args: {
    value: "Medium",
    disabled: false,
    onChange: () => {},
  },
  argTypes: {
    value: {
      control: "select",
      options: ["", "High", "Medium", "Low"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormPriority>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
