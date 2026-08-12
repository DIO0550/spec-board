import type { Meta, StoryObj } from "@storybook/react-vite";
import { SavePathPreview } from ".";

const meta = {
  component: SavePathPreview,
  args: {
    preview: {
      kind: "path",
      fileName: "search-pagination.md",
      relPath: "tasks/search-pagination.md",
      fullPath: "/workspace/payments-service/tasks/search-pagination.md",
    },
  },
} satisfies Meta<typeof SavePathPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { suppressWarning: false } };
export const EdgeCases: Story = {
  args: {
    preview: {
      kind: "path",
      fileName: "long.md",
      relPath: `tasks/${"nested/".repeat(8)}long.md`,
      fullPath: `/workspace/${"nested/".repeat(12)}long.md`,
    },
  },
};
export const Loading: Story = { args: { preview: { kind: "pending" } } };
export const ErrorState: Story = {
  name: "Error",
  args: {
    preview: {
      kind: "invalid",
      error: "ファイル名に使用できない文字が含まれています",
    },
  },
};
export const ErrorSuppressed: Story = {
  args: {
    preview: { kind: "invalid", error: "重複エラー" },
    suppressWarning: true,
  },
};
