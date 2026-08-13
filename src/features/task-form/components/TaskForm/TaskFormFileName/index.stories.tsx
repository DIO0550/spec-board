import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskFormFileName } from ".";

const meta = {
  component: TaskFormFileName,
  args: { value: "search-pagination", disabled: false, onChange: fn() },
} satisfies Meta<typeof TaskFormFileName>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { value: "custom-file-name" } };
export const EdgeCases: Story = { args: { value: "a".repeat(180) } };
export const Empty: Story = { args: { value: "" } };
export const Filled: Story = { args: { value: "custom-file-name" } };
export const ErrorState: Story = {
  name: "Error",
  args: {
    value: "invalid<name",
    error: { code: "FORBIDDEN_CHAR", chars: ["<"] },
  },
};
export const Submitting: Story = { args: { disabled: true } };
