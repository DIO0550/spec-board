// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { initialTasks } from "@/test-fixtures";
import { TaskFormLinks } from ".";

const selected = initialTasks.slice(0, 2);
const meta = {
  component: TaskFormLinks,
  args: {
    links: selected.map((task) => task.filePath),
    selectedTasks: selected,
    candidates: initialTasks.slice(2),
    onAdd: fn(),
    onRemove: fn(),
    disabled: false,
  },
} satisfies Meta<typeof TaskFormLinks>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: { links: ["tasks/missing.md"], selectedTasks: [], candidates: [] },
};
export const Empty: Story = {
  args: { links: [], selectedTasks: [], candidates: [] },
};
export const Filled: Story = {};
export const Open: Story = {
  args: { links: [], selectedTasks: [], candidates: initialTasks },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByPlaceholderText("関連タスクを検索して追加"),
    );
  },
};
export const Submitting: Story = { args: { disabled: true } };
