// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { Column } from "@/types/column";
import { StatusField } from ".";

const meta: Meta<typeof StatusField> = {
  component: StatusField,
  args: {
    onChange: fn(),
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof StatusField>;

const COLUMNS: Column[] = [
  { name: "Todo", order: 0, color: "#3b82f6" },
  { name: "In Progress", order: 1, color: "#f59e0b" },
  { name: "Done", order: 2, color: "#16a34a" },
];

export const Default: Story = {
  args: {
    columns: COLUMNS,
    value: "Todo",
  },
};

export const Unselected: Story = {
  args: {
    columns: COLUMNS,
    value: "",
  },
};

export const Disabled: Story = {
  args: {
    columns: COLUMNS,
    value: "Todo",
    disabled: true,
  },
};
