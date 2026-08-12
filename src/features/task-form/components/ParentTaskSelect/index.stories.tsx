// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { initialTasks } from "@/test-fixtures";
import { ParentTaskSelect } from ".";

const meta: Meta<typeof ParentTaskSelect> = {
  component: ParentTaskSelect,
  args: {
    tasks: initialTasks,
    value: undefined,
    onChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ParentTaskSelect>;

export const Default: Story = {};
export const AllProps: Story = { args: { value: initialTasks[0].filePath } };
export const EdgeCases: Story = { args: { tasks: [], value: undefined } };
export const Empty: Story = { args: { tasks: [], value: undefined } };
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByPlaceholderText("タスクを検索して選択"),
    );
  },
};

export const Unselected: Story = {
  args: { value: undefined },
};

export const Selected: Story = {
  args: { value: initialTasks[0].filePath },
};

export const Disabled: Story = {
  args: { value: initialTasks[0].filePath, disabled: true },
};
