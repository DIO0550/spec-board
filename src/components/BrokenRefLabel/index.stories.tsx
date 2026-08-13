// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrokenRefLabel } from ".";

const meta: Meta<typeof BrokenRefLabel> = {
  component: BrokenRefLabel,
  args: { rawPath: "tasks/missing-task.md" },
  argTypes: {
    rawPath: { control: "text" },
    pathTestId: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="flex w-96 items-center gap-2 rounded border border-border p-3">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BrokenRefLabel>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    rawPath: "archive/removed-parent-task.md",
    pathTestId: "broken-path",
  },
};
export const EdgeCases: Story = {
  args: {
    rawPath:
      "very/deeply/nested/directory/with-a-very-long-missing-task-file-name.md",
  },
};
