// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
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

export const Default: Story = { ...Selected };
export const AllProps: Story = { ...Disabled };
export const EdgeCases: Story = { ...Unselected };

export const Open: Story = {
  ...Selected,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("priority-field"));
  },
};
