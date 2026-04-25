// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/lib/mock-data";
import { ParentTaskSelect } from ".";

const meta: Meta<typeof ParentTaskSelect> = {
  component: ParentTaskSelect,
  args: {
    tasks: initialTasks,
    value: undefined,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ParentTaskSelect>;

export const Unselected: Story = {
  args: { value: undefined },
};

export const Selected: Story = {
  args: { value: initialTasks[0].filePath },
};

export const Disabled: Story = {
  args: { value: initialTasks[0].filePath, disabled: true },
};
