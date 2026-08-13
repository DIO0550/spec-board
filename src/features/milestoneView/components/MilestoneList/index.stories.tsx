// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  CLOSED_MILESTONE,
  OPEN_MILESTONE,
  STORY_NOW,
  STORY_PROJECTION,
} from "../storyFixtures";
import { MilestoneList } from ".";

const meta: Meta<typeof MilestoneList> = {
  component: MilestoneList,
  parameters: { layout: "padded" },
  args: {
    milestones: [OPEN_MILESTONE, CLOSED_MILESTONE],
    statusOf: (definition) =>
      definition.state === "closed" ? "closed" : "open",
    projectionOf: () => STORY_PROJECTION,
    showRatio: true,
    selectedName: undefined,
    onSelect: fn(),
    now: STORY_NOW,
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneList>;
export const Default: Story = {};
export const AllProps: Story = { args: { selectedName: OPEN_MILESTONE.name } };
export const EdgeCases: Story = { args: { milestones: [] } };
