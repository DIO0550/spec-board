// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TabNav } from ".";

const tabs = [
  { id: "board", label: "ボード" },
  { id: "list", label: "リスト" },
  { id: "tree", label: "ツリー" },
] as const;

const meta: Meta<typeof TabNav> = {
  component: TabNav,
  args: {
    tabs,
    activeTabId: "board",
    idPrefix: "story-view",
    ariaLabel: "表示形式",
    onSelect: fn(),
  },
  argTypes: {
    tabs: { control: "object" },
    activeTabId: { control: "text" },
    idPrefix: { control: false },
    ariaLabel: { control: "text" },
    onSelect: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[32rem] bg-surface px-3 pt-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TabNav>;

export const Default: Story = {};
export const AllProps: Story = { args: { activeTabId: "list" } };
export const EdgeCases: Story = {
  args: {
    tabs: [{ id: "only", label: "非常に長い単一タブのラベル" }],
    activeTabId: "only",
  },
};
export const Empty: Story = { args: { tabs: [], activeTabId: "" } };
