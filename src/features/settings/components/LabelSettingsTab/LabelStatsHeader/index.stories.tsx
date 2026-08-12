import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelStatsHeader } from ".";

const meta = {
  component: LabelStatsHeader,
  args: {
    total: 14,
    used: 11,
    unused: 3,
    isExportDisabled: false,
    onExport: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LabelStatsHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { total: 999, used: 998, unused: 1 } };
export const EdgeCases: Story = {
  args: { total: 0, used: 0, unused: 0, isExportDisabled: true },
};
