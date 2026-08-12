import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { CodeViewer } from ".";

const config = {
  id: "config" as const,
  name: "config.json",
  path: ".spec-board/config.json",
  badge: "1.4 KB",
  language: "JSON" as const,
  content: '{\n  "version": 1,\n  "doneColumn": "Done"\n}',
  generated: false,
};
const meta = {
  component: CodeViewer,
  args: {
    file: config,
    onCopy: fn(),
    onRegenerate: fn(),
    onOpenExternal: fn(),
  },
  decorators: [
    (Story) => (
      <div className="min-h-[500px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CodeViewer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    file: {
      ...config,
      id: "guide",
      name: "GUIDE.md",
      path: ".spec-board/GUIDE.md",
      badge: "自動生成",
      language: "Markdown",
      content: "# Guide\n\n- Todo\n- Done",
      generated: true,
    },
  },
};
export const EdgeCases: Story = { args: { file: { ...config, content: "" } } };
