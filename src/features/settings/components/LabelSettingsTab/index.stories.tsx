// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelDefinition } from "@/domains/label-definition";
import type { LabelsResource } from "@/hooks/useLabels";
import { LabelSettingsTab } from ".";

const FIXTURE_LABELS = LabelDefinition.listFromWire([
  {
    name: "a11y",
    description: "アクセシビリティ関連",
    group: "area",
    color: "#7860b5",
    updated: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "backend",
    description: "API・サーバーサイド",
    group: "area",
    color: "#d27830",
    updated: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "bug",
    description: "バグ報告・修正",
    group: "type",
    color: "#d55753",
    updated: new Date(Date.now() - 2 * 60_000).toISOString(),
  },
  {
    name: "docs",
    description: "ドキュメント更新",
    group: "type",
    color: "#79818d",
    updated: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "enhancement",
    description: "既存機能の改善",
    group: "type",
    color: "#14874e",
    updated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "epic",
    description: "複数のタスクをまとめるエピック",
    group: "type",
    color: "#466abf",
    updated: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "feature",
    description: "新機能の追加",
    group: "type",
    color: "#14874e",
    updated: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "frontend",
    description: "UI / クライアントサイド",
    group: "area",
    color: "#d27830",
    updated: new Date(Date.now() - 2 * 60_000).toISOString(),
  },
  {
    name: "needs-triage",
    description: "未トリアージ",
    group: "status",
  },
  {
    name: "perf",
    description: "パフォーマンス改善",
    group: "area",
    color: "#14874e",
    updated: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "priority:high",
    description: "リリースまでに必須",
    group: "priority",
    color: "#d55753",
    updated: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    name: "priority:low",
    description: "余裕があれば対応",
    group: "priority",
    color: "#14874e",
    updated: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "priority:medium",
    description: "次のスプリントで対応",
    group: "priority",
    color: "#d27830",
    updated: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    name: "wontfix",
    description: "対応しない判断",
    group: "status",
    color: "#79818d",
    updated: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
  },
]);

const FIXTURE_USAGE_COUNTS: Record<string, number> = {
  a11y: 2,
  backend: 5,
  bug: 8,
  docs: 3,
  enhancement: 4,
  epic: 5,
  feature: 12,
  frontend: 9,
  perf: 1,
  "priority:high": 3,
  "priority:low": 6,
  "priority:medium": 7,
};

const noopReload = async (): Promise<void> => {};

const loadedResource: LabelsResource = {
  labels: FIXTURE_LABELS,
  usageCounts: FIXTURE_USAGE_COUNTS,
  byName: LabelDefinition.byName(FIXTURE_LABELS),
  status: "loaded",
  reload: noopReload,
};

const emptyResource: LabelsResource = {
  labels: [],
  usageCounts: {},
  byName: new Map(),
  status: "loaded",
  reload: noopReload,
};

const loadingResource: LabelsResource = {
  labels: [],
  usageCounts: {},
  byName: new Map(),
  status: "loading",
  reload: noopReload,
};

const errorResource: LabelsResource = {
  labels: [],
  usageCounts: {},
  byName: new Map(),
  status: "error",
  error: "labels.yml の読み込みに失敗しました",
  reload: noopReload,
};

const meta: Meta<typeof LabelSettingsTab> = {
  component: LabelSettingsTab,
  args: {
    resource: loadedResource,
    onLabelUsageClick: fn(),
    onOpenSource: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background px-8 py-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LabelSettingsTab>;

export const Default: Story = {};

export const AllProps: Story = { args: { resource: loadedResource } };

export const EdgeCases: Story = { args: { resource: emptyResource } };

export const Loaded: Story = {
  args: { resource: loadedResource },
};

export const Empty: Story = {
  args: { resource: emptyResource },
};

export const Loading: Story = {
  args: { resource: loadingResource },
};

export const ErrorState: Story = {
  args: { resource: errorResource },
};
