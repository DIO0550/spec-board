// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Task } from "@/types/task";
import { CommandPalette } from ".";

const tasks = [
  Task.fromPayload({
    id: "SB-42",
    title: "Keyboard shortcuts",
    status: "Todo",
    labels: ["a11y", "frontend"],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/keyboard-shortcuts.md",
  }),
  Task.fromPayload({
    id: "SB-51",
    title: "Global search",
    status: "In Progress",
    labels: ["search"],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/search/global-search.md",
  }),
];

const meta: Meta<typeof CommandPalette> = {
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
  args: {
    tasks,
    isOpen: false,
    onOpenChange: fn(),
    onTaskSelect: fn(),
    onNewTask: fn(),
    onSettings: fn(),
    onMilestones: fn(),
    onGuide: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof CommandPalette>;
export const Default: Story = {};
export const AllProps: Story = { args: { isOpen: true } };
export const EdgeCases: Story = {
  args: {
    isOpen: true,
    tasks: [
      Task.fromPayload({
        id: "LONG",
        title:
          "非常に長いタイトルがCommand Paletteの横幅を超えた場合の省略表示を検証するタスク",
        status: "Todo",
        labels: ["very-long-label"],
        links: [],
        children: [],
        reverseLinks: [],
        body: "",
        filePath: "tasks/deep/nested/very-long-file-name.md",
      }),
      ...Array.from({ length: 60 }, (_, index) =>
        Task.fromPayload({
          id: `SB-BULK-${index}`,
          title: `大量データ表示上限確認 ${index}`,
          status: "Todo",
          labels: ["performance"],
          links: [],
          children: [],
          reverseLinks: [],
          body: "",
          filePath: `tasks/bulk/${index}.md`,
        }),
      ),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("option")).toHaveLength(50);
    await expect(canvas.getByText(/65件中50件を表示/)).toBeVisible();
  },
};
export const Open: Story = {
  args: { isOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox")).toHaveFocus();
    await expect(canvas.getAllByRole("option")).toHaveLength(6);
  },
};
export const Empty: Story = {
  args: { isOpen: true, tasks: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("combobox"), "no-match");
    await expect(canvas.getByText("一致する項目がありません")).toBeVisible();
  },
};
export const Keyboard: Story = {
  args: { isOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    await userEvent.type(input, "global");
    await userEvent.keyboard("{Enter}");
    await expect(meta.args?.onTaskSelect).toHaveBeenCalledWith("SB-51");
  },
};
