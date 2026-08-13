// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LiveRegion } from ".";

const meta: Meta<typeof LiveRegion> = {
  component: LiveRegion,
  args: { announcement: { id: 2, text: "タスクを移動しました" } },
  argTypes: { announcement: { control: "object" } },
};

export default meta;
type Story = StoryObj<typeof LiveRegion>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { announcement: { id: 3, text: "設定を保存しました" } },
};
export const EdgeCases: Story = {
  args: { announcement: { id: 4, text: "" } },
};
export const Empty: Story = { args: { announcement: null } };
