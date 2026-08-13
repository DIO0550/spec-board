import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ConfigFileList } from ".";

const files = [
  {
    id: "config" as const,
    name: "config.json",
    path: ".spec-board/config.json",
    badge: "1.4 KB",
    language: "JSON" as const,
    content: "{}",
    generated: false,
  },
  {
    id: "guide" as const,
    name: "GUIDE.md",
    path: ".spec-board/GUIDE.md",
    badge: "自動生成",
    language: "Markdown" as const,
    content: "# Guide",
    generated: true,
  },
];
const meta = {
  component: ConfigFileList,
  args: { files, selectedId: "config", onSelect: fn() },
  decorators: [
    (Story) => (
      <div className="w-[230px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfigFileList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { selectedId: "guide" } };
export const EdgeCases: Story = {
  args: {
    files: [{ ...files[0], name: "an-extremely-long-config-file-name.json" }],
  },
};
