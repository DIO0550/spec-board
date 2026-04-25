// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelTag } from ".";

const meta: Meta<typeof LabelTag> = {
  component: LabelTag,
  args: {
    label: "bug",
  },
};

export default meta;

type Story = StoryObj<typeof LabelTag>;

export const Short: Story = { args: { label: "bug" } };

export const Long: Story = {
  args: { label: "long-label-name-for-overflow-test" },
};
