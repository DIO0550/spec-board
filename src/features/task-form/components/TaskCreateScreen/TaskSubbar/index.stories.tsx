import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskSubbar } from ".";

const meta = {
  component: TaskSubbar,
  args: { fileName: "search-pagination.md", onBack: fn() },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TaskSubbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: { fileName: `${"very-long-file-name-".repeat(12)}.md` },
};
export const Empty: Story = { args: { fileName: "new-issue.md" } };
