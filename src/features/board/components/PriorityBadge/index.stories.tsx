// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PriorityBadge } from ".";

const meta: Meta<typeof PriorityBadge> = {
  component: PriorityBadge,
  args: {
    priority: "High",
  },
  argTypes: {
    priority: {
      control: "select",
      options: ["High", "Medium", "Low", undefined],
    },
  },
};

export default meta;

type Story = StoryObj<typeof PriorityBadge>;

export const High: Story = { args: { priority: "High" } };
export const Medium: Story = { args: { priority: "Medium" } };
export const Low: Story = { args: { priority: "Low" } };
export const Undefined: Story = { args: { priority: undefined } };
