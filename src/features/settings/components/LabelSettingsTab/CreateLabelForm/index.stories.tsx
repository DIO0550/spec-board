import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { LabelDefinition, LabelDraft } from "@/domains/label-definition";
import { CreateLabelForm } from ".";

const values = {
  name: "needs-design",
  description: "デザイン待ちのタスク",
  group: "status",
  color: "#7860b5",
};
const meta = {
  component: CreateLabelForm,
  args: {
    values,
    editingName: null,
    isPending: false,
    validation: LabelDraft.validate(values, [], null),
    groupOptions: ["type", "priority", "area", "status"],
    onChange: fn(),
    onReset: fn(),
    onSubmit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CreateLabelForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    editingName: LabelDefinition.fromWire({ name: "needs-design" }).name,
  },
};
export const EdgeCases: Story = {
  args: {
    values: { name: "", description: "", group: "", color: "invalid" },
    validation: LabelDraft.validate(
      { name: "", description: "", group: "", color: "invalid" },
      [],
      null,
    ),
    groupOptions: [],
    isPending: true,
  },
};
export const GroupOpen: Story = {
  /**
   * グループ選択を開いた状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("combobox", { name: "グループ" }),
    );
  },
};
export const ColorOpen: Story = {
  /**
   * カラープリセットを選び、入力へフォーカスした状態を再現する。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "プリセット purple" }),
    );
    within(canvasElement)
      .getByRole("textbox", { name: /カラー/ })
      .focus();
  },
};
export const Dark: Story = {
  /** dark テーマで表示する。 */
  play: async () => {
    document.documentElement.dataset.theme = "dark";
  },
};
