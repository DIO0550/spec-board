import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SubNav } from ".";

const tabs = [
  { id: "labels", label: "ラベル", count: 14 },
  { id: "milestones", label: "マイルストーン", count: 5 },
  { id: "statuses", label: "ステータス", count: 5 },
  { id: "config", label: "設定ファイル" },
  { id: "appearance", label: "外観" },
];
const meta = {
  component: SubNav,
  args: { tabs, activeTabId: "labels", onSelect: fn(), onBack: fn() },
  decorators: [
    (Story) => (
      <div className="h-11">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SubNav>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { activeTabId: "config" } };
export const EdgeCases: Story = {
  args: {
    tabs: [{ id: "only", label: "非常に長い設定タブ名", count: 999 }],
    activeTabId: "only",
  },
};
