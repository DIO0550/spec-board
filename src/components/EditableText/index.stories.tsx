// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditableText } from ".";

const meta: Meta<typeof EditableText> = {
  component: EditableText,
  args: {
    value: "編集可能なテキスト",
    onConfirm: () => {},
  },
  argTypes: {
    value: { control: "text" },
    ariaLabel: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof EditableText>;

export const Default: Story = {};

export const LongText: Story = {
  args: {
    value:
      "とても長いテキストの例。Storybook の Canvas 上で truncate（省略表示）が効くかどうかを確認するために、敢えて長めの文字列を投入している。",
  },
};

export const Empty: Story = {
  args: { value: "" },
};

export const WithAriaLabel: Story = {
  args: {
    value: "見出し",
    ariaLabel: "ボード名",
  },
};
