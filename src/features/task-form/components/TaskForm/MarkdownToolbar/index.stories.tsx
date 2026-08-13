import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MarkdownToolbar } from ".";

const meta = {
  component: MarkdownToolbar,
  args: { onApply: fn(), disabled: false },
} satisfies Meta<typeof MarkdownToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  decorators: [
    (Story) => (
      <div className="w-[340px] overflow-x-auto">
        <Story />
      </div>
    ),
  ],
};
export const Submitting: Story = { args: { disabled: true } };
