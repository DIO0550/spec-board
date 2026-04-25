// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialTasks } from "@/lib/mock-data";
import { TaskFormParent } from ".";

const meta: Meta<typeof TaskFormParent> = {
  component: TaskFormParent,
  args: {
    tasks: initialTasks,
    value: undefined,
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormParent>;

export const Default: Story = {};
