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

export const WithProject: Story = {
  args: { projectName: "my-board-project" },
};

export const NoProject: Story = {
  args: { projectName: undefined },
};
