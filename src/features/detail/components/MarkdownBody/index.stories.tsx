// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownBody } from ".";

const meta: Meta<typeof MarkdownBody> = {
  component: MarkdownBody,
  args: {
    body: "",
  },
  argTypes: {
    body: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof MarkdownBody>;

export const Empty: Story = {
  args: { body: "" },
};

export const Heading: Story = {
  args: {
    body: "# 見出し 1\n\n## 見出し 2\n\n### 見出し 3\n\n本文の段落",
  },
};

export const List: Story = {
  args: {
    body: "TODO リスト:\n\n- 一つ目の項目\n- 二つ目の項目\n- 三つ目の項目",
  },
};

export const CodeBlock: Story = {
  args: {
    body: "サンプルコード:\n\n```\nconst foo = 'bar';\nconsole.log(foo);\n```",
  },
};

export const Inline: Story = {
  args: {
    body: "テキストには **強調** や `inline code` が含まれることがあります。",
  },
};
