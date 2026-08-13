// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BodyTaskProgress } from ".";

const meta: Meta<typeof BodyTaskProgress> = {
  component: BodyTaskProgress,
  args: { done: 2, total: 5 },
  argTypes: {
    done: { control: { type: "number", min: 0 } },
    total: { control: { type: "number", min: 0 } },
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BodyTaskProgress>;

export const Default: Story = {};
export const AllProps: Story = { args: { done: 4, total: 7 } };
export const EdgeCases: Story = { args: { done: 1, total: 1 } };
export const Empty: Story = { args: { done: 0, total: 0 } };
