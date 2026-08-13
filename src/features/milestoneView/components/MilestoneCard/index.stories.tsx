// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  CLOSED_MILESTONE,
  OPEN_MILESTONE,
  STORY_NOW,
  STORY_PROJECTION,
} from "../storyFixtures";
import { MilestoneCard } from ".";

const meta: Meta<typeof MilestoneCard> = {
  component: MilestoneCard,
  parameters: { layout: "padded" },
  args: {
    def: OPEN_MILESTONE,
    status: "open",
    projection: STORY_PROJECTION,
    showRatio: true,
    selected: false,
    onSelect: fn(),
    now: STORY_NOW,
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneCard>;
export const Default: Story = {};
export const AllProps: Story = { args: { selected: true } };
export const EdgeCases: Story = {
  args: {
    def: CLOSED_MILESTONE,
    status: "closed",
    projection: { done: 0, total: 0, taskFilePaths: [] },
    showRatio: false,
  },
};
