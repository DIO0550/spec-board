import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskFormDraft } from ".";

const meta = {
  component: TaskFormDraft,
  args: { checked: false, disabled: false, onChange: fn() },
} satisfies Meta<typeof TaskFormDraft>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { checked: true } };
export const EdgeCases: Story = { args: { checked: true, disabled: true } };
export const Empty: Story = { args: { checked: false } };
export const Submitting: Story = { args: { disabled: true } };
