// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskFormBody } from ".";

const meta: Meta<typeof TaskFormBody> = {
  component: TaskFormBody,
  args: {
    value: "## 概要\n\nタスクの説明文をここに記述する",
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormBody>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
