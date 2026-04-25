// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { initialColumns, initialTasks } from "@/lib/mock-data";
import { TaskCreateModal } from ".";

const meta: Meta<typeof TaskCreateModal> = {
  component: TaskCreateModal,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    columns: initialColumns,
    initialStatus: "Todo",
    parentCandidates: initialTasks,
    onSubmit: async () => {},
    onClose: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskCreateModal>;

export const Default: Story = {};

export const WithInitialParent: Story = {
  args: {
    initialParent: initialTasks[0].filePath,
  },
};
