import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from ".";

const meta: Meta<typeof Button> = {
  component: Button,
  args: {
    variant: "primary",
    children: "Button",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary"],
    },
    disabled: { control: "boolean" },
    type: {
      control: "select",
      options: ["button", "submit", "reset"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: "primary", children: "Primary" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Secondary" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
};

export const WithDataAttribute: Story = {
  args: {
    children: "With data-testid",
    "data-testid": "button-sample",
  },
};
