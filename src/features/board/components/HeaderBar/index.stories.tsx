// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HeaderBar } from ".";

const meta: Meta<typeof HeaderBar> = {
  component: HeaderBar,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onSettingsClick: () => {},
    onOpenClick: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof HeaderBar>;

export const BoardView: Story = {
  args: { view: "board" },
};

export const SettingsView: Story = {
  args: { view: "settings" },
};

export const WithMilestone: Story = {
  args: { view: "board", onMilestoneClick: () => {} },
};
