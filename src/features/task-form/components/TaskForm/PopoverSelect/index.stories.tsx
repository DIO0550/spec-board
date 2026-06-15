// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PopoverSelect } from ".";

const meta: Meta<typeof PopoverSelect> = {
  component: PopoverSelect,
  args: {
    label: "ステータス",
    onChange: fn(),
    disabled: false,
    "data-testid": "story-popover-select",
  },
};

export default meta;

type Story = StoryObj<typeof PopoverSelect>;

const STATUS_OPTIONS = [
  { value: "Todo", label: "Todo", swatchColor: "oklch(0.55 0.13 265)" },
  {
    value: "In Progress",
    label: "In Progress",
    swatchColor: "oklch(0.66 0.14 65)",
  },
  { value: "Done", label: "Done", swatchColor: "oklch(0.55 0.13 155)" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "なし" },
  { value: "High", label: "High", badgeClassName: "bg-red-100 text-red-800" },
  {
    value: "Medium",
    label: "Medium",
    badgeClassName: "bg-yellow-100 text-yellow-800",
  },
  { value: "Low", label: "Low", badgeClassName: "bg-blue-100 text-blue-800" },
];

export const Status: Story = {
  args: {
    label: "ステータス",
    required: true,
    options: STATUS_OPTIONS,
    value: "Todo",
  },
};

export const Priority: Story = {
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: "High",
  },
};

export const Empty: Story = {
  args: {
    label: "優先度",
    options: PRIORITY_OPTIONS,
    value: "",
  },
};

export const Disabled: Story = {
  args: {
    label: "ステータス",
    options: STATUS_OPTIONS,
    value: "Done",
    disabled: true,
  },
};
