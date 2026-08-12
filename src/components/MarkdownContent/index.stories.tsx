// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownContent } from ".";

const meta: Meta<typeof MarkdownContent> = {
  component: MarkdownContent,
  args: {
    body: "## 実装メモ\n\n仕様に合わせてレイアウトを調整します。",
  },
  argTypes: { body: { control: "text" } },
  decorators: [
    (Story) => (
      <article className="w-[36rem] rounded border border-border bg-surface p-5">
        <Story />
      </article>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MarkdownContent>;

export const Default: Story = {};
export const AllProps: Story = {
  args: {
    body: [
      "# リリース準備",
      "",
      "> 本番反映前に確認してください。",
      "",
      "- [x] テストを実行",
      "- [ ] リリースノートを更新",
      "",
      "```ts",
      'const status = "ready";',
      "```",
    ].join("\n"),
  },
};
export const EdgeCases: Story = {
  args: {
    body: "長いURL: https://example.com/a/very/long/path/that/should-wrap/inside/the/content/area",
  },
};
export const Empty: Story = { args: { body: "" } };
