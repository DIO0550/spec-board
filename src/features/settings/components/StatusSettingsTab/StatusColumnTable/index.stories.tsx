import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { StatusColumnTable } from ".";

const columns = [
  { id: "todo", name: "Todo", taskCount: 4, color: "#466abf" },
  { id: "done", name: "Done", taskCount: 0, color: "#14874e" },
];
const meta = {
  component: StatusColumnTable,
  args: {
    columns,
    doneColumn: "Done",
    onNameChange: fn(),
    onMove: fn(),
    onDoneChange: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[900px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusColumnTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    columns: [
      ...columns,
      { id: "blocked", name: "Blocked", taskCount: 0, color: "#d55753" },
    ],
  },
};
export const EdgeCases: Story = {
  args: {
    columns: [
      { id: "only", name: "Only column", taskCount: 0, color: "#79818d" },
    ],
    doneColumn: "Only column",
  },
};
