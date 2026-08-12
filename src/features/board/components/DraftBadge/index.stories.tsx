import type { Meta, StoryObj } from "@storybook/react-vite";
import { DraftBadge } from ".";

const meta = { component: DraftBadge, args: { draft: true } } satisfies Meta<
  typeof DraftBadge
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = { args: { draft: true } };
export const EdgeCases: Story = { args: { draft: false } };
