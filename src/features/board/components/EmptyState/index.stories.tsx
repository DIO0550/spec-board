// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from ".";

const meta: Meta<typeof EmptyState> = {
  component: EmptyState,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof EmptyState>;

export const NoProject: Story = {
  args: { type: "no-project", onOpenProject: () => {} },
};

export const EmptyProject: Story = {
  args: { type: "empty-project" },
};
