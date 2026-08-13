// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { MilestoneCreateModal } from ".";

const meta: Meta<typeof MilestoneCreateModal> = {
  component: MilestoneCreateModal,
  parameters: { layout: "fullscreen" },
  args: {
    subtitle: "payments-service · milestones.yml",
    labelOptions: ["release", "frontend", "backend"],
    assigneeOptions: ["mika", "ren", "sora"],
    onCreate: fn(async () => true),
    onClose: fn(),
    onLabelsChange: fn(),
    onAssigneeChange: fn(),
    isPending: false,
  },
};
export default meta;
type Story = StoryObj<typeof MilestoneCreateModal>;

export const Default: Story = {};

export const AllProps: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("milestone-create-name"), "v1.8");
    await userEvent.type(
      canvas.getByTestId("milestone-create-title"),
      "モバイル対応",
    );
    await userEvent.type(
      canvas.getByTestId("milestone-create-due"),
      "2026-11-30",
    );
    await userEvent.type(
      canvas.getByTestId("milestone-create-description"),
      "小画面向けレイアウトと操作を整備",
    );
    await userEvent.type(
      canvas.getByTestId("milestone-create-labels"),
      "release, frontend",
    );
    await userEvent.selectOptions(
      canvas.getByTestId("milestone-create-assignee"),
      "mika",
    );
  },
};

export const Filled: Story = { ...AllProps };

export const Validation: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByTestId("milestone-create-name");
    await userEvent.click(input);
    await userEvent.tab();
  },
};

export const Pending: Story = { args: { isPending: true } };
export const WithoutSubtitle: Story = { args: { subtitle: undefined } };
export const EdgeCases: Story = {
  args: {
    subtitle:
      "非常に長いプロジェクト名-with-a-long-repository-name · milestones.yml",
  },
};
export const Dark: Story = {
  play: async () => {
    document.documentElement.dataset.theme = "dark";
  },
};
