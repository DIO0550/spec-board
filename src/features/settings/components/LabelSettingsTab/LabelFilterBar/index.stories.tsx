import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelFilterBar } from ".";

const meta = {
  component: LabelFilterBar,
  args: {
    totalCount: 14,
    groupOptions: [
      { group: "type", count: 5 },
      { group: "priority", count: 3 },
      { group: "area", count: 4 },
    ],
    groupFilter: { kind: "all" },
    keyword: "",
    sort: "name",
    onGroupChange: fn(),
    onKeywordChange: fn(),
    onSortChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LabelFilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    groupFilter: { kind: "group", value: "priority" },
    keyword: "high",
    sort: "usage",
  },
};
export const EdgeCases: Story = {
  args: {
    totalCount: 0,
    groupOptions: [],
    keyword: "一致しない長い検索キーワード",
  },
};
