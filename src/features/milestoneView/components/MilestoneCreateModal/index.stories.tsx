// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MilestoneCreateModal } from ".";

const meta: Meta<typeof MilestoneCreateModal> = {
  component: MilestoneCreateModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    subtitle: "payments-service · milestones.yml",
    onCreate: fn(async () => true),
    onClose: fn(),
    isPending: false,
  },
};

export default meta;

type Story = StoryObj<typeof MilestoneCreateModal>;

/** デザインモック準拠の標準表示。 */
export const Default: Story = {};

/** サブタイトル無し（プロジェクトコンテキストを出さない表示）。 */
export const WithoutSubtitle: Story = {
  args: {
    subtitle: undefined,
  },
};

/** 送信中（pending）。送信ボタンが disabled で「作成中…」に切り替わる。 */
export const Pending: Story = {
  args: {
    isPending: true,
  },
};
