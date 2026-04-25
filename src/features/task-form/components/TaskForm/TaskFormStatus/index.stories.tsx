// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns } from "@/lib/mock-data";
import { TaskFormStatus } from ".";

const meta: Meta<typeof TaskFormStatus> = {
  component: TaskFormStatus,
  args: {
    columns: initialColumns,
    value: "Todo",
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormStatus>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
