// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { makeDetailTask } from "../storybook/fixtures";
import { ParseErrorBanner } from ".";

const invalidTask = makeDetailTask({
  warnings: [
    {
      code: "invalidStatusUsedDefault",
      field: "status",
      message: "invalid status",
    },
  ],
});
const meta: Meta<typeof ParseErrorBanner> = {
  component: ParseErrorBanner,
  args: { task: invalidTask },
};
export default meta;
type Story = StoryObj<typeof ParseErrorBanner>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    task: makeDetailTask({
      warnings: [
        { code: "invalidDue", field: "due", message: "invalid due" },
        {
          code: "invalidStatusUsedDefault",
          field: "status",
          message: "invalid status",
        },
      ],
    }),
  },
};
export const EdgeCases: Story = {
  args: { task: makeDetailTask({ warnings: [] }) },
};
