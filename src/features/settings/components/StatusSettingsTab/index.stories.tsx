import type { Meta, StoryContext, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { StatusSettingsTab, type StatusSettingsTabProps } from ".";

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
} satisfies Meta<StatusSettingsTabProps>;
export default meta;
type Story = StoryObj<StatusSettingsTabProps>;
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
  /**
   * 新しいカラム名を入力し、未保存の変更がある状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }: StoryContext<StatusSettingsTabProps>) => {
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
