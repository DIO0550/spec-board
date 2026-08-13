import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskFormDue } from ".";

const meta = {
  component: TaskFormDue,
  args: { value: "", disabled: false, onChange: fn() },
} satisfies Meta<typeof TaskFormDue>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { value: "2026-09-18" } };
export const EdgeCases: Story = { args: { value: "2099-12-31" } };
export const Empty: Story = { args: { value: "" } };
export const Filled: Story = { args: { value: "2026-09-18" } };
export const Submitting: Story = {
  args: { value: "2026-09-18", disabled: true },
};
