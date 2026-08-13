// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ThemeProvider } from "@/features/shell";
import { HeaderBar } from ".";

const meta: Meta<typeof HeaderBar> = {
  component: HeaderBar,
  // HeaderBar は ThemeToggleButton 経由で useTheme を呼ぶため、Provider が無いと
  // Storybook のエラー画面になる。
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onSettingsClick: fn(),
    onOpenClick: fn(),
    onGuideClick: fn(),
    onSearchClick: fn(),
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

export const Default: Story = { ...BoardView };
export const AllProps: Story = {
  args: { view: "board", projectName: "payments-service", onGuideClick: fn() },
};
export const EdgeCases: Story = { ...SettingsView };
