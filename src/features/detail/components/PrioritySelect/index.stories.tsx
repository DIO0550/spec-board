// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrioritySelect } from ".";

const meta: Meta<typeof PrioritySelect> = {
  component: PrioritySelect,
  args: {
    value: "High",
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof PrioritySelect>;

export const WithValue: Story = { args: { value: "Medium" } };
export const Undefined: Story = { args: { value: undefined } };
