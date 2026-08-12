import { type ReactNode, useState } from "react";
import type { MilestoneProjectionMap } from "@/domains/milestone-projection";
import type { LabelsResource } from "@/hooks/useLabels";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { UseMilestoneMutationsResult } from "../../hooks/useMilestoneMutations";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { AppearanceSettingsTab } from "../AppearanceSettingsTab";
import { ConfigFileTab } from "../ConfigFileTab";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { MilestoneSettingsTab } from "../MilestoneSettingsTab";
import { StatusSettingsTab } from "../StatusSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";

/** 設定画面に登録するタブ一覧。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [
  { id: "labels", label: "ラベル", count: 14 },
  { id: "milestones", label: "マイルストーン", count: 5 },
  { id: "statuses", label: "ステータス", count: 5 },
  { id: "config", label: "設定ファイル" },
  { id: "appearance", label: "外観" },
];

type ActivePanelProps = {
  /** アクティブタブの識別子 */
  tabId: string;
  /** ラベルリソース（labels タブへ配る） */
  labels: LabelsResource;
  /** マイルストーンリソース（milestones タブへ配る） */
  milestones: MilestonesResource;
  /** live milestone usage projection（milestones タブへ配る） */
  milestoneProjections: MilestoneProjectionMap;
  /** App が hoist 保持するマイルストーン CRUD ハンドル（milestones タブへ配る） */
  milestoneMutations: UseMilestoneMutationsResult;
  /**
   * ラベル設定タブから board へ遷移して指定ラベルでフィルタを掛けるコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
};

/**
 * アクティブタブ ID に対応するパネルを描画するコンポーネント。
 * id → コンポーネントの対応付けは view 層の責務として本コンポーネント（switch）に
 * 閉じ込め、タブのデータ型（SettingsTab）には持たせない。未知 id は描画しない。
 * @param props - tabId とリソースを含む props
 * @returns 対応するパネル要素、未知 id なら null
 */
const ActivePanel = ({
  tabId,
  labels,
  milestones,
  milestoneProjections,
  milestoneMutations,
  onLabelUsageClick,
}: ActivePanelProps): ReactNode => {
  switch (tabId) {
    case "labels":
      return (
        <LabelSettingsTab
          resource={labels}
          onLabelUsageClick={onLabelUsageClick}
        />
      );
    case "milestones":
      return (
        <MilestoneSettingsTab
          resource={milestones}
          milestoneProjections={milestoneProjections}
          mutations={milestoneMutations}
        />
      );
    case "appearance":
      return <AppearanceSettingsTab />;
    case "statuses":
      return <StatusSettingsTab />;
    case "config":
      return <ConfigFileTab />;
    default:
      return null;
  }
};

type SettingsScreenProps = {
  /**
   * ラベルリソース。App が唯一の取得点（useLabels）として保持し、settings 用に
   * live `usageCounts` 上書きを掛けたものを受け取る。
   */
  labels: LabelsResource;
  /**
   * マイルストーンリソース。App が唯一の取得点（useMilestones）として保持するものを
   * 受け取り、board / milestoneView と共有する。設定タブでの CRUD 後の reload が
   * 同一リソースに効くため、バッジ / フィルタ / 専用ビューが即時に最新化される。
   */
  milestones: MilestonesResource;
  /** ProjectData が保持する live milestone projection map。 */
  milestoneProjections: MilestoneProjectionMap;
  /**
   * マイルストーン CRUD ハンドル。App で hoist 保持し、本タブとマイルストーンビュー
   * （MilestoneCreateModal）で同一インスタンスを共有することで、画面遷移を跨いだ
   * 並行書き込みを単一の in-flight ガードで直列化する。
   */
  milestoneMutations: UseMilestoneMutationsResult;
  /**
   * 使用数クリックで board へ遷移しそのラベルで絞り込むコールバック。
   * @param labelName - クリックされたラベル名
   */
  onLabelUsageClick: (labelName: string) => void;
  /** 初期表示タブ。Story/外部ルーティングから直接到達するために使う。 */
  initialTabId?: string;
  /** 戻るaction。App未接続時はno-op。 */
  onBack?: () => void;
};

/**
 * 設定画面本体。SubNav + アクティブタブのパネルを合成する。
 * board state には依存しない（App 側で保持・据え置き）。ラベル / マイルストーンリソースは
 * App から共有で受け取る（独自取得はしない）。
 * @param props - {@link SettingsScreenProps}
 * @returns 設定画面要素
 */
export const SettingsScreen = ({
  labels,
  milestones,
  milestoneProjections,
  milestoneMutations,
  onLabelUsageClick,
  initialTabId = SETTINGS_TABS[0].id,
  onBack,
}: SettingsScreenProps) => {
  const [activeTabId, setActiveTabId] = useState<string>(initialTabId);
  const activeTab = SettingsTab.selectActive(SETTINGS_TABS, activeTabId);

  return (
    <div className="grid h-full min-h-0 flex-1 grid-rows-[48px_44px_minmax(0,1fr)] overflow-hidden bg-background">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4">
        <span
          aria-hidden="true"
          className="size-[22px] rounded-md bg-gradient-to-br from-accent to-violet-700"
        />
        <strong className="text-[13px]">spec-board</strong>
        <span className="font-mono text-xs text-muted">
          payments-service · ~/work/payments-service
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2 py-1 text-[11.5px] text-muted">
          <span className="size-1.5 rounded-full bg-success" /> 同期中 · 監視
          127 files
        </span>
      </header>
      <SubNav
        tabs={SETTINGS_TABS}
        activeTabId={activeTab.id}
        onSelect={setActiveTabId}
        onBack={onBack}
      />
      <div
        role="tabpanel"
        id={subNavPanelId(activeTab.id)}
        aria-labelledby={subNavTabId(activeTab.id)}
        className="min-h-0 overflow-auto px-8 py-6 pb-14"
      >
        <ActivePanel
          tabId={activeTab.id}
          labels={labels}
          milestones={milestones}
          milestoneProjections={milestoneProjections}
          milestoneMutations={milestoneMutations}
          onLabelUsageClick={onLabelUsageClick}
        />
      </div>
    </div>
  );
};
