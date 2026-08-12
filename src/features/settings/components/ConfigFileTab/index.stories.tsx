import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { ConfigFileTab } from ".";

const meta = {
  component: ConfigFileTab,
  args: {
    onCopy: fn(),
    onRegenerate: fn(),
    onOpenExternal: fn(),
    onRevealFolder: fn(),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-8 py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfigFileTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: { initialFile: "guide", toast: "GUIDE.md を再生成しました" },
};
export const EdgeCases: Story = { args: { files: [] } };
export const CopyToast: Story = {
  args: { toast: "config.json をコピーしました" },
};
export const GuideSelected: Story = { args: { initialFile: "guide" } };
export const Regenerate: Story = {
  args: { initialFile: "guide" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "再生成" }),
    );
  },
};
export const CopyAction: Story = {
  args: { initialFile: "guide" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "コピー" }),
    );
  },
};
export const OpenExternal: Story = {
  args: { initialFile: "guide" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "外部エディタで開く" }),
    );
  },
};
export const RevealFolder: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "フォルダを開く" }),
    );
  },
};
