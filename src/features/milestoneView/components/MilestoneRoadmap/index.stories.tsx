// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { MilestoneDefinition } from "@/domains/milestone";
import { MilestoneRoadmap } from ".";

// Visual regression は実行日で月軸と今日マーカーが変わらないよう基準時刻を固定する。
const STORY_NOW = new Date("2026-07-30T12:00:00Z");

/** 今月起点 8 か月の範囲に分散したサンプル定義（open / closed / overdue 混在）。 */
const SAMPLE_MILESTONES: MilestoneDefinition[] = [
  {
    name: "v1.4",
    title: "v1.4 — リリース済",
    due: "2026-05-31",
    state: "closed",
  },
  {
    name: "sprint-24",
    title: "Sprint 24 — 安定化",
    due: "2026-06-18",
    state: "open",
  },
  {
    name: "v1.5",
    title: "v1.5 — 検索 & フィルター",
    due: "2026-07-10",
    state: "open",
  },
  {
    name: "v1.6",
    title: "v1.6 — 通知センター",
    due: "2026-08-25",
    state: "open",
  },
  {
    name: "ops-2026q3",
    title: "Ops 2026Q3",
    due: "2026-09-01",
    state: "open",
  },
  {
    name: "v1.7",
    title: "v1.7 — レポート",
    due: "2026-10-05",
    state: "open",
  },
];

const meta: Meta<typeof MilestoneRoadmap> = {
  component: MilestoneRoadmap,
  parameters: {
    layout: "padded",
  },
  args: {
    milestones: SAMPLE_MILESTONES,
    selectedName: undefined,
    onSelect: fn(),
    now: STORY_NOW,
  },
};

export default meta;

type Story = StoryObj<typeof MilestoneRoadmap>;

/** 標準表示（今月起点・複数マイルストーンが帯で並ぶ）。 */
export const Default: Story = {};

/** v1.5 が選択されている状態（accent-soft の枠が出る）。 */
export const WithSelection: Story = {
  args: {
    selectedName: "v1.5",
  },
};

/** マイルストーンが 1 件のみ（最小ケース）。 */
export const SingleMilestone: Story = {
  args: {
    milestones: [SAMPLE_MILESTONES[2]],
  },
};

/** 期日設定のあるマイルストーン 0 件（空状態メッセージ）。 */
export const Empty: Story = {
  args: {
    milestones: [
      {
        name: "no-due",
        title: "期日未設定のもの",
        state: "open",
      },
    ],
  },
};
