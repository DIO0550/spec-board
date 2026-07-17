// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { MilestoneDefinition } from "@/domains/milestone";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import type { MilestonesResource } from "@/hooks/useMilestones";
import { MilestoneViewScreen } from ".";

/** デザインモック準拠のサンプルマイルストーン群（open / closed / overdue を網羅）。 */
const SAMPLE_MILESTONES: MilestoneDefinition[] = [
  {
    name: "v1.5",
    title: "v1.5 — 検索 & フィルター",
    description: "全文検索とラベル/期日複合フィルタの実装",
    due: "2026-07-10",
    state: "open",
    order: 1,
  },
  {
    name: "v1.6",
    title: "v1.6 — 通知センター",
    description: "メンション通知とリアルタイム配信",
    due: "2026-08-25",
    state: "open",
    order: 2,
  },
  {
    name: "v1.7",
    title: "v1.7 — レポート",
    description: "進捗バーンダウンと月次サマリエクスポート",
    due: "2026-10-05",
    state: "open",
    order: 3,
  },
  {
    name: "sprint-24",
    title: "Sprint 24 — 安定化",
    description: "クラッシュ修正と回帰テスト整備",
    due: "2026-06-18",
    state: "open",
    order: 4,
  },
  {
    name: "v1.4",
    title: "v1.4 — リリース済",
    description: "ボード機能の安定化リリース",
    due: "2026-05-31",
    state: "closed",
    order: 5,
  },
  {
    name: "ops-2026q3",
    title: "Ops 2026Q3",
    description: "監視・SLO 改善",
    due: "2026-09-01",
    state: "open",
    order: 6,
  },
];

/**
 * テスト用 Task を組み立てる小ヘルパ。
 * @param id - Task id
 * @param title - Task title
 * @param milestone - 紐付けるマイルストーン名
 * @param status - status カラム名
 * @returns 構築済み Task
 */
const makeTask = (
  id: string,
  title: string,
  milestone: string,
  status: string,
): Task => {
  const payload: TaskFromPayloadInput = {
    id,
    title,
    status,
    milestone,
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `${id}.md`,
    extras: {},
    warnings: [],
  };
  return Task.fromPayload(payload);
};

const SAMPLE_TASKS: Task[] = [
  makeTask("v15-1", "全文検索バックエンド", "v1.5", "Doing"),
  makeTask("v15-2", "フィルタ UI", "v1.5", "Done"),
  makeTask("v15-3", "ラベル絞り込み", "v1.5", "Todo"),
  makeTask("v15-4", "Q1 振り返り", "v1.5", "Done"),
  makeTask("v16-1", "通知 schema", "v1.6", "Todo"),
  makeTask("v16-2", "メール送信", "v1.6", "Todo"),
  makeTask("v17-1", "バーンダウン算出", "v1.7", "Todo"),
  makeTask("v17-2", "PDF エクスポート", "v1.7", "Todo"),
  makeTask("s24-1", "クラッシュ再現", "sprint-24", "Done"),
  makeTask("s24-2", "回帰テスト追加", "sprint-24", "Doing"),
  makeTask("v14-1", "リリースノート", "v1.4", "Done"),
  makeTask("v14-2", "本番デプロイ", "v1.4", "Done"),
  makeTask("ops-1", "メトリクス整理", "ops-2026q3", "Todo"),
];

/** Storybook では reload を呼ばないので no-op で埋める。 */
const noopReload = () => Promise.resolve();

const LOADED_RESOURCE: MilestonesResource = {
  status: "loaded",
  milestones: SAMPLE_MILESTONES,
  byName: new Map(SAMPLE_MILESTONES.map((m) => [m.name, m])),
  usageCounts: Object.fromEntries(
    SAMPLE_TASKS.reduce((acc, t) => {
      if (t.milestone !== undefined) {
        acc.set(t.milestone, (acc.get(t.milestone) ?? 0) + 1);
      }
      return acc;
    }, new Map<string, number>()),
  ),
  reload: noopReload,
};

const EMPTY_RESOURCE: MilestonesResource = {
  status: "loaded",
  milestones: [],
  byName: new Map(),
  usageCounts: {},
  reload: noopReload,
};

const LOADING_RESOURCE: MilestonesResource = {
  status: "loading",
  milestones: [],
  byName: new Map(),
  usageCounts: {},
  reload: noopReload,
};

const ERROR_RESOURCE: MilestonesResource = {
  status: "error",
  milestones: [],
  byName: new Map(),
  usageCounts: {},
  error: "読み込みに失敗しました",
  reload: noopReload,
};

const meta: Meta<typeof MilestoneViewScreen> = {
  component: MilestoneViewScreen,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    resource: LOADED_RESOURCE,
    tasks: SAMPLE_TASKS,
    doneColumn: "Done",
  },
};

export default meta;

type Story = StoryObj<typeof MilestoneViewScreen>;

/** デザインモック準拠の標準表示。一覧モード・未選択。 */
export const Default: Story = {};

/** done カラム未解決（doneColumn = undefined）— 進捗バーが非表示になる。 */
export const WithoutDoneColumn: Story = {
  args: {
    doneColumn: undefined,
  },
};

/** マイルストーン 0 件。 */
export const Empty: Story = {
  args: {
    resource: EMPTY_RESOURCE,
    tasks: [],
  },
};

/** 読み込み中。 */
export const Loading: Story = {
  args: {
    resource: LOADING_RESOURCE,
    tasks: [],
  },
};

/** 読み込みエラー。 */
export const ErrorState: Story = {
  args: {
    resource: ERROR_RESOURCE,
    tasks: [],
  },
};

/**
 * 追加導線あり — ヘッダ右に「マイルストーンを追加」ボタンが出現し、
 * クリックで作成モーダルが開く。
 */
export const WithCreateAction: Story = {
  args: {
    onCreateMilestone: fn(async () => true),
    isCreating: false,
  },
};
