// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelChip } from ".";

const meta: Meta<typeof LabelChip> = {
  component: LabelChip,
  args: {
    label: "bug",
    onRemove: () => {},
    disabled: false,
  },
};

export default meta;

type Story = StoryObj<typeof LabelChip>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};
