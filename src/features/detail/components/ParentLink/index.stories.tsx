// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { makeDetailTask, parentTask } from "../storybook/fixtures";
import { ParentLink } from ".";

const meta: Meta<typeof ParentLink> = {
  component: ParentLink,
  args: { parentTask, onSelect: fn() },
};
export default meta;
type Story = StoryObj<typeof ParentLink>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  args: {
    parentTask: makeDetailTask({
      title:
        "非常に長い親Issueタイトルがサイドバー内で省略されることを確認する",
    }),
  },
};
