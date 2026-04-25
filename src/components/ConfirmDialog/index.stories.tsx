// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from ".";

const meta: Meta<typeof ConfirmDialog> = {
  component: ConfirmDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    title: "削除しますか？",
    message: "この操作は取り消せません。",
    confirmLabel: "削除",
    cancelLabel: "キャンセル",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {};

export const WithExtraChildren: Story = {
  args: {
    children: (
      <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-700">
        補足: 削除した項目は復元できません。
      </div>
    ),
  },
};

export const ConfirmDisabled: Story = {
  args: { confirmDisabled: true },
};

export const CancelDisabled: Story = {
  args: { cancelDisabled: true },
};
