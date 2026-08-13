// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  CLOSED_MILESTONE,
  OPEN_MILESTONE,
  STORY_NOW,
  STORY_PROJECTION,
} from "../storyFixtures";
import { MilestoneDetailSidebar } from ".";

const meta: Meta<typeof MilestoneDetailSidebar> = {
  component: MilestoneDetailSidebar,
  parameters: { viewport: { defaultViewport: "desktop" } },
  decorators: [
    (Story) => (
      <div className="flex min-h-[760px] justify-end">
        <Story />
      </div>
    ),
  ],
  args: {
    def: OPEN_MILESTONE,
    status: "open",
    projection: STORY_PROJECTION,
    showRatio: true,
    tasks: [],
    taskProjections: new Map(),
    onTaskClick: fn(),
    now: STORY_NOW,
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneDetailSidebar>;
export const Default: Story = {};
export const AllProps: Story = {
  args: {
    def: CLOSED_MILESTONE,
    status: "closed",
    projection: { done: 10, total: 10, taskFilePaths: [] },
  },
};
export const EdgeCases: Story = {
  args: {
    def: undefined,
    status: undefined,
    projection: undefined,
    showRatio: false,
  },
};
