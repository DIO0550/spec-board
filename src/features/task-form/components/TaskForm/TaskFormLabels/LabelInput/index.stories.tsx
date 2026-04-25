// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelInput } from ".";

const meta: Meta<typeof LabelInput> = {
  component: LabelInput,
  args: {
    id: "label-input-story",
    value: "",
    onChange: () => {},
    onKeyDown: () => {},
    onBlur: () => {},
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof LabelInput>;

export const Empty: Story = { args: { value: "" } };

export const WithValue: Story = { args: { value: "frontend" } };

export const Disabled: Story = {
  args: { value: "frontend", disabled: true },
};
