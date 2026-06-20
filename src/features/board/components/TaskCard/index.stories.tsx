// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { initialTasks } from "@/test-fixtures";
import type { Task } from "@/types/task";
import { TaskCard } from ".";

const baseTask: Task = initialTasks[0];

const meta: Meta<typeof TaskCard> = {
  component: TaskCard,
  args: {
    task: baseTask,
    childTasks: [],
    descendantTasks: [],
    doneColumn: "Done",
    fromColumn: "Todo",
    onDragStart: fn(),
    onDragEnd: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof TaskCard>;

export const Default: Story = {};

export const Clickable: Story = {
  args: { onClick: () => {} },
};

export const Dragging: Story = {
  args: { isDragging: true },
};

export const WithBrokenLink: Story = {
  args: { hasBrokenLink: true },
};

export const Draggable: Story = {
  args: {
    onDragStart: fn(),
    onDragEnd: fn(),
  },
};

export const HighPriority: Story = {
  args: {
    task: { ...baseTask, priority: "High", title: "高優先度のタスク" },
  },
};

export const WithLabels: Story = {
  args: {
    task: {
      ...baseTask,
      labels: ["bug", "frontend", "urgent"],
    },
  },
};

const childTasks = initialTasks.filter(
  (t) => t.hierarchy.parentFilePath === baseTask.filePath,
);

export const WithChildren: Story = {
  args: {
    task: { ...baseTask },
    childTasks,
    descendantTasks: childTasks,
  },
};

export const WithDescendantsBeyondDirectChildren: Story = {
  args: {
    task: { ...baseTask },
    childTasks,
    descendantTasks: [
      ...childTasks,
      ...initialTasks.slice(0, 3).map((t) => ({
        ...t,
        id: `extra-${t.id}`,
        status: "Done",
      })),
    ],
  },
};

export const Minimal: Story = {
  args: {
    task: {
      ...baseTask,
      priority: undefined,
      labels: [],
      hierarchy: { ...baseTask.hierarchy, childFilePaths: [] },
      title: "最小構成のタスク",
    },
    childTasks: [],
    descendantTasks: [],
  },
};

// --- Compound 経路（新 API）: render 上書きで TaskCard.Root + 子サブ部品を組み立てる ---

export const HeaderOnly: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Header />
    </TaskCard.Root>
  ),
};

export const MilestoneOnly: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Milestone />
    </TaskCard.Root>
  ),
  args: { task: { ...baseTask, milestone: "v1.0" } },
};

export const LabelsOnly: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Labels />
    </TaskCard.Root>
  ),
  args: { task: { ...baseTask, labels: ["bug", "urgent"] } },
};

export const ProgressOnly: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Progress />
    </TaskCard.Root>
  ),
  args: {
    task: baseTask,
    childTasks,
    descendantTasks: childTasks,
  },
};

export const FooterOnly: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Footer />
    </TaskCard.Root>
  ),
};

export const CompoundFull: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Header />
      <TaskCard.Milestone />
      <TaskCard.Labels />
      <TaskCard.Progress />
      <TaskCard.Footer />
    </TaskCard.Root>
  ),
  args: {
    task: { ...baseTask, milestone: "v1.0", labels: ["bug", "urgent"] },
    childTasks,
    descendantTasks: childTasks,
  },
};

export const ReorderedFooterFirst: Story = {
  render: (args) => (
    <TaskCard.Root {...args}>
      <TaskCard.Footer />
      <TaskCard.Header />
      <TaskCard.Labels />
    </TaskCard.Root>
  ),
  args: { task: { ...baseTask, labels: ["bug", "frontend"] } },
};

export const WithMilestoneAndLabels: Story = {
  args: {
    task: {
      ...baseTask,
      milestone: "v1.0",
      labels: ["bug", "urgent"],
    },
  },
};
