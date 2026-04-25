// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelEditor } from ".";

const meta: Meta<typeof LabelEditor> = {
  component: LabelEditor,
  args: {
    labels: [],
    onAdd: () => {},
    onRemove: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof LabelEditor>;

export const Empty: Story = { args: { labels: [] } };

export const WithLabels: Story = {
  args: { labels: ["bug", "frontend"] },
};

export const Many: Story = {
  args: {
    labels: [
      "bug",
      "frontend",
      "backend",
      "design",
      "docs",
      "performance",
      "security",
      "urgent",
      "review-needed",
    ],
  },
};
