import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelDefinition } from "@/domains/label-definition";
import { LabelTable } from ".";

const labels = LabelDefinition.listFromWire([
  {
    name: "bug",
    description: "バグ報告・修正",
    group: "type",
    color: "#d55753",
    updated: "2026-08-11T12:00:00Z",
  },
  {
    name: "frontend",
    description: "UI / クライアントサイド",
    group: "area",
    color: "#d27830",
  },
  {
    name: "priority:high",
    description: "リリースまでに必須",
    group: "priority",
    color: "#d55753",
    updated: "2026-08-10T12:00:00Z",
  },
]);
const meta = {
  component: LabelTable,
  args: {
    labels,
    usageCounts: { bug: 8, frontend: 9, "priority:high": 0 },
    isPending: false,
    now: new Date("2026-08-11T12:00:00Z"),
    onUsageClick: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LabelTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { isPending: true } };
export const EdgeCases: Story = { args: { labels: [] } };
export const LongContent: Story = {
  args: {
    labels: LabelDefinition.listFromWire([
      {
        name: "a-very-long-label-name-for-overflow",
        description:
          "長い説明文がセル幅を超えた場合にもテーブルの列幅を維持して省略表示されます",
        group: "an-unusually-long-group-name",
      },
    ]),
  },
};
