// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DueBadge } from ".";

const meta: Meta<typeof DueBadge> = {
  component: DueBadge,
  args: { due: "2026-08-14", today: "2026-08-11" },
  argTypes: {
    due: { control: "text" },
    today: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof DueBadge>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { due: "2026-08-11", today: "2026-08-11" },
};
export const EdgeCases: Story = {
  args: { due: "2026-08-01", today: "2026-08-11" },
};
export const Empty: Story = { args: { due: undefined } };
