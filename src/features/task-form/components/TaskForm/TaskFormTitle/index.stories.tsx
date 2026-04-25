// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskFormTitle } from ".";

const meta: Meta<typeof TaskFormTitle> = {
  component: TaskFormTitle,
  args: {
    value: "ログイン画面のバグ修正",
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormTitle>;

export const Default: Story = {};

export const WithError: Story = {
  args: { value: "", error: "タイトルを入力してください" },
};
