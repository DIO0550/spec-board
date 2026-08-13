import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PreviewResizer } from ".";

const meta = {
  component: PreviewResizer,
  args: { onWidthChange: fn() },
  decorators: [
    (Story) => (
      <div className="grid h-96 grid-cols-[1fr_4px_480px] bg-panel">
        <div />
        <Story />
        <div className="bg-panel-2" />
      </div>
    ),
  ],
} satisfies Meta<typeof PreviewResizer>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  decorators: [
    (Story) => (
      <div className="grid h-40 grid-cols-[1fr_4px_340px]">
        <div />
        <Story />
        <div className="bg-panel-2" />
      </div>
    ),
  ],
};
