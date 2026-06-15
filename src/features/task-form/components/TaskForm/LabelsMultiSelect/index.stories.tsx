// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import type { LabelDefinition } from "@/lib/tauri";
import { LabelsMultiSelect } from ".";

const SUGGESTIONS: LabelDefinition[] = [
  { name: "bug", color: "#e11d48" },
  { name: "feature", color: "#16a34a" },
  { name: "enhancement", color: "#2563eb" },
  { name: "docs", color: "#d97706" },
  { name: "good first issue" },
];

const meta: Meta<typeof LabelsMultiSelect> = {
  component: LabelsMultiSelect,
  // popover が下方向へ開くため、ドロップダウンが見切れないよう余白を確保する。
  decorators: [
    (Story) => (
      <div style={{ minHeight: 380, width: 360 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: "ラベル",
    selected: [],
    suggestions: SUGGESTIONS,
    onToggle: fn(),
    disabled: false,
    "data-testid": "story-labels",
  },
};

export default meta;

type Story = StoryObj<typeof LabelsMultiSelect>;

export const Empty: Story = {};

export const WithSelection: Story = {
  args: { selected: ["bug", "docs"] },
};

/** popover を開いて選択できるラベル一覧を表示した状態。 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("story-labels"));
  },
};

/** 一部を選択済み（✓ 表示）の状態で popover を開いた見た目。 */
export const OpenWithSelection: Story = {
  args: { selected: ["bug", "enhancement"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("story-labels"));
  },
};

/** popover を開いて検索で絞り込んだ状態（既存に無い語は「作成」候補が出る）。 */
export const OpenWithSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("story-labels"));
    await userEvent.type(canvas.getByTestId("story-labels-search"), "urgent");
  },
};

export const NoSuggestions: Story = {
  args: { suggestions: [] },
};

export const Disabled: Story = {
  args: { selected: ["feature"], disabled: true },
};
