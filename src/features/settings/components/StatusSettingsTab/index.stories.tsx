import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { StatusSettingsTab } from ".";

const meta = {
  component: StatusSettingsTab,
  args: { onSave: fn(), onOpenBoard: fn(), onOpenConfig: fn() },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-8 py-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusSettingsTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { saveState: "saved" } };
export const EdgeCases: Story = {
  args: {
    initialColumns: [
      {
        id: "only",
        name: "Done with an unusually long column name",
        taskCount: 0,
        color: "#7860b5",
      },
    ],
    initialDoneColumn: "Done with an unusually long column name",
    saveState: "error",
  },
};
export const Saving: Story = { args: { saveState: "saving" } };

export const Dirty: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole("textbox", { name: "新しいカラム名" }),
      "Blocked",
    );
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "カラムを追加" }),
    );
  },
};

export const ErrorState: Story = {
  name: "Error",
  args: { saveState: "error" },
};
