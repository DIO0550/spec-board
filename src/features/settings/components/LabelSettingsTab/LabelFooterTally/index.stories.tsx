import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelFooterTally } from ".";

const meta = {
  component: LabelFooterTally,
  args: {
    shown: 14,
    total: 14,
    colorTally: [
      { color: "#d55753", count: 3 },
      { color: "area", count: 4 },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LabelFooterTally>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    shown: 7,
    total: 14,
    colorTally: [
      { color: "#d55753", count: 3 },
      { color: "#14874e", count: 2 },
      { color: "priority", count: 3 },
    ],
  },
};
export const EdgeCases: Story = {
  args: { shown: 0, total: 0, colorTally: [] },
};
