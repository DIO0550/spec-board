import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MilestoneSettingsTab } from ".";

const resource = {
  milestones: [
    { name: "v1", title: "Version 1", due: "2026-09-30", state: "open" },
  ],
  usageCounts: { v1: 8 },
  byName: new Map(),
  status: "loaded" as const,
  reload: fn(async () => {}),
};
const mutations = {
  isPending: false,
  create: fn(async () => true),
  update: fn(async () => true),
  remove: fn(async () => null),
};
const meta = {
  component: MilestoneSettingsTab,
  args: { resource, milestoneProjections: new Map(), mutations },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1080px] p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MilestoneSettingsTab>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  args: { mutations: { ...mutations, isPending: true } },
};
export const EdgeCases: Story = {
  args: {
    resource: {
      ...resource,
      milestones: [],
      usageCounts: {},
      byName: new Map(),
    },
  },
};
export const Loading: Story = {
  args: { resource: { ...resource, milestones: [], status: "loading" } },
};
