import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskTopbar } from ".";

const meta = {
  component: TaskTopbar,
  args: {
    projectName: "payments-service",
    projectPath: "~/work/payments-service",
    watchedFileCount: 127,
    previewVisible: true,
    onTogglePreview: fn(),
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof TaskTopbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    projectName: "長いプロジェクト名".repeat(8),
    projectPath: `/workspace/${"nested/".repeat(12)}`,
    watchedFileCount: 99999,
  },
};
export const Empty: Story = {
  args: { projectName: undefined, projectPath: undefined, watchedFileCount: 0 },
};
export const Collapsed: Story = { args: { previewVisible: false } };
