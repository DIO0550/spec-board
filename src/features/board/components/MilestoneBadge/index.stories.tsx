import type { Meta, StoryObj } from "@storybook/react-vite";
import { MilestoneBadge } from ".";

const meta = {
  component: MilestoneBadge,
  args: { name: "v1.0" },
} satisfies Meta<typeof MilestoneBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    definition: {
      name: "v1.0",
      title: "正式リリース",
      due: "2026-09-30",
      description: "最初の安定版",
    },
  },
};
export const EdgeCases: Story = { args: { name: "未定義のマイルストーン" } };
