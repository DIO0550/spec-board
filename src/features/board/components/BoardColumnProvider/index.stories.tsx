import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { BoardColumnProvider, useBoardColumn } from ".";

const ColumnProviderHarness = () => {
  const column = useBoardColumn();
  return (
    <dl className="grid max-w-sm grid-cols-2 gap-2 rounded border border-border p-4 text-sm">
      <dt>カラム</dt>
      <dd>{column.existingNames().join(", ") || "なし"}</dd>
      <dt>Todo件数</dt>
      <dd>{column.taskCountInColumn("Todo")}</dd>
      <dt>DnD</dt>
      <dd>{column.dndDisabled ? "無効" : "有効"}</dd>
    </dl>
  );
};
const meta = {
  component: BoardColumnProvider,
  args: {
    columns: initialColumns,
    tasks: initialTasks,
    allTasks: initialTasks,
    onColumnReorder: fn(),
    children: <ColumnProviderHarness />,
  },
} satisfies Meta<typeof BoardColumnProvider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { args: { dndDisabled: true } };
export const EdgeCases: Story = {
  args: { columns: [], tasks: [], allTasks: [] },
};
