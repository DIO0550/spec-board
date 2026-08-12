// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OptionSwatch } from ".";

const meta: Meta<typeof OptionSwatch> = {
  component: OptionSwatch,
  args: { color: "#2563eb" },
  argTypes: { color: { control: "color" } },
};

export default meta;
type Story = StoryObj<typeof OptionSwatch>;

export const Default: Story = {};
export const AllProps: Story = { args: { color: "#16a34a" } };
export const EdgeCases: Story = { args: { color: "transparent" } };
