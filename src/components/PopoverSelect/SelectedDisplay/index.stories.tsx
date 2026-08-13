// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SelectedDisplay } from ".";

const meta: Meta<typeof SelectedDisplay> = {
  component: SelectedDisplay,
  args: {
    option: { value: "progress", label: "In Progress", swatchColor: "#d97706" },
  },
  argTypes: { option: { control: "object" } },
  decorators: [
    (Story) => (
      <div className="w-56 rounded border border-border bg-surface px-3 py-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SelectedDisplay>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    option: {
      value: "high",
      label: "High",
      badgeClassName: "bg-red-100 text-red-800",
    },
  },
};
export const EdgeCases: Story = {
  args: {
    option: {
      value: "long",
      label: "非常に長い選択中ラベルが省略される状態",
      swatchColor: "#0891b2",
    },
  },
};
export const Empty: Story = { args: { option: undefined } };
