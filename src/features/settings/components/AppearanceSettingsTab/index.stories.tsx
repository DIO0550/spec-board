import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "@/features/shell";
import { AppearanceSettingsTab } from ".";

const meta = {
  component: AppearanceSettingsTab,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="min-h-screen bg-background p-8">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppearanceSettingsTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};
