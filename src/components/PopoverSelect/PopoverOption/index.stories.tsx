// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PopoverOption } from ".";

const meta: Meta<typeof PopoverOption> = {
  component: PopoverOption,
  args: {
    option: { value: "todo", label: "Todo", swatchColor: "#2563eb" },
    optionId: "status-option-todo",
    testId: "story-popover-option",
    selected: false,
    active: false,
    onMouseEnter: fn(),
    onSelect: fn(),
  },
  argTypes: {
    option: { control: "object" },
    optionId: { control: false },
    testId: { control: false },
    selected: { control: "boolean" },
    active: { control: "boolean" },
    onMouseEnter: { control: false },
    onSelect: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-64 rounded-lg border border-border bg-surface p-1 shadow-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PopoverOption>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    option: {
      value: "high",
      label: "High",
      badgeClassName: "bg-red-100 text-red-800",
    },
    selected: true,
    active: true,
  },
};
export const EdgeCases: Story = {
  args: {
    option: {
      value: "long",
      label: "非常に長い選択肢のラベルが省略表示される状態",
      swatchColor: "#7c3aed",
    },
    active: true,
  },
};
