// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns } from "@/test-fixtures";
import { StatusSelect } from ".";

const meta: Meta<typeof StatusSelect> = {
  component: StatusSelect,
  args: {
    value: "Todo",
    columns: initialColumns,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof StatusSelect>;

export const Default: Story = {};

export const ManyColumns: Story = {
  args: {
    value: "Review",
    columns: [
      { name: "Backlog", order: 0 },
      { name: "Todo", order: 1 },
      { name: "In Progress", order: 2 },
      { name: "Review", order: 3 },
      { name: "QA", order: 4 },
      { name: "Done", order: 5 },
    ],
  },
};
