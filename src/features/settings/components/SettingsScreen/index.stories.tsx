import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { LabelDefinition } from "@/domains/label-definition";
import { ThemeProvider } from "@/features/shell";
import { SettingsScreen } from ".";

const labels = LabelDefinition.listFromWire([
  { name: "bug", description: "バグ報告", group: "type", color: "#d55753" },
]);
const labelsResource = {
  labels,
  usageCounts: { bug: 8 },
  byName: LabelDefinition.byName(labels),
  status: "loaded" as const,
  reload: fn(async () => {}),
};
const milestonesResource = {
  milestones: [],
  usageCounts: {},
  byName: new Map(),
  status: "loaded" as const,
  reload: fn(async () => {}),
};
const milestoneMutations = {
  isPending: false,
  create: fn(async () => true),
  update: fn(async () => true),
  remove: fn(async () => null),
};
const meta = {
  component: SettingsScreen,
  args: {
    labels: labelsResource,
    milestones: milestonesResource,
    milestoneProjections: new Map(),
    milestoneMutations,
    onLabelUsageClick: fn(),
    onBack: fn(),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="h-screen min-h-[720px]">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SettingsScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { initialTabId: "statuses" } };
export const EdgeCases: Story = {
  args: {
    initialTabId: "config",
    labels: {
      ...labelsResource,
      labels: [],
      usageCounts: {},
      byName: new Map(),
    },
  },
};
export const Status: Story = { args: { initialTabId: "statuses" } };
export const ConfigFile: Story = { args: { initialTabId: "config" } };

const selectGuide = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole("tab", { name: /GUIDE\.md/ }),
  );
};

export const ConfigGuideSelected: Story = {
  args: { initialTabId: "config" },
  play: async ({ canvasElement }) => selectGuide(canvasElement),
};
export const ConfigRegenerate: Story = {
  args: { initialTabId: "config" },
  play: async ({ canvasElement }) => {
    await selectGuide(canvasElement);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "再生成" }),
    );
  },
};
export const ConfigCopy: Story = {
  args: { initialTabId: "config" },
  play: async ({ canvasElement }) => {
    await selectGuide(canvasElement);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "コピー" }),
    );
  },
};
export const ConfigOpenExternal: Story = {
  args: { initialTabId: "config" },
  play: async ({ canvasElement }) => {
    await selectGuide(canvasElement);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "外部エディタで開く" }),
    );
  },
};
export const ConfigRevealFolder: Story = {
  args: { initialTabId: "config" },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "フォルダを開く" }),
    );
  },
};
export const AppearanceDarkCompact: Story = {
  args: { initialTabId: "appearance" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ダーク" }));
    await userEvent.click(canvas.getByRole("button", { name: "コンパクト" }));
    await userEvent.click(canvas.getByRole("button", { name: /バイオレット/ }));
  },
};
export const AppearanceAccentFixed: Story = {
  args: { initialTabId: "appearance" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ライト" }));
    await userEvent.click(canvas.getByRole("button", { name: "標準" }));
    await userEvent.click(canvas.getByRole("button", { name: /ローズ/ }));
  },
};
