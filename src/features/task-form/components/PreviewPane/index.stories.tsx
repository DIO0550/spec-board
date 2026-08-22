// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { TauriError } from "@/lib/tauri";
import { PreviewPane } from ".";

const markdown = `---
title: 検索結果ページのページネーション
status: In Progress
priority: High
labels:
  - frontend
due: 2026-09-18
---
## 概要

検索結果をページ単位で表示します。

- [ ] APIを実装
- [x] UIを設計`;

const meta = {
  component: PreviewPane,
  args: {
    state: { kind: "ready", markdown, error: null },
    fileName: "search-pagination.md",
    onCollapse: fn(),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="ml-auto h-[680px] w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PreviewPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    state: {
      kind: "ready",
      markdown: `---\ntitle: '${"非常に長いタイトル".repeat(10)}'\nstatus: Todo\n---\n`,
      error: null,
    },
    fileName: `${"long-file-name-".repeat(8)}.md`,
  },
};
export const Empty: Story = {
  args: {
    state: {
      kind: "ready",
      markdown: "---\ntitle: ''\nstatus: Todo\n---\n",
      error: null,
    },
  },
};
export const Raw: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Raw" }),
    );
  },
};
export const Loading: Story = {
  args: { state: { kind: "pending", markdown: null, error: null } },
};
export const ErrorState: Story = {
  name: "Error",
  args: {
    state: {
      kind: "error",
      markdown: null,
      error: new TauriError("PARSE_ERROR", "プレビューを生成できません"),
    },
  },
};
