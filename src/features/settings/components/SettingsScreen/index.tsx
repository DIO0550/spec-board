import { type ReactNode, useState } from "react";
import type { LabelsResource } from "@/hooks/useLabels";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { UseMilestoneMutationsResult } from "../../hooks/useMilestoneMutations";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { AppearanceSettingsTab } from "../AppearanceSettingsTab";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { MilestoneSettingsTab } from "../MilestoneSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";

/** 設定画面に登録するタブ一覧（ラベル / マイルストーン / 外観）。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [
  { id: "labels", label: "ラベル" },
  { id: "milestones", label: "マイルストーン" },
  { id: "appearance", label: "外観" },
];

type ActivePanelProps = {
  /** アクティブタブの識別子 */
  tabId: string;
  /** ラベルリソース（labels タブへ配る） */
  labels: LabelsResource;
  /** マイルストーンリソース（milestones タブへ配る） */
  milestones: MilestonesResource;
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
          mutations={milestoneMutations}
        />
      );
    case "appearance":
      return <AppearanceSettingsTab />;
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
  milestoneMutations,
  onLabelUsageClick,
}: SettingsScreenProps) => {
  const [activeTabId, setActiveTabId] = useState<string>(SETTINGS_TABS[0].id);
  const activeTab = SettingsTab.selectActive(SETTINGS_TABS, activeTabId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SubNav
        tabs={SETTINGS_TABS}
        activeTabId={activeTab.id}
        onSelect={setActiveTabId}
      />
      <div
        role="tabpanel"
        id={subNavPanelId(activeTab.id)}
        aria-labelledby={subNavTabId(activeTab.id)}
        className="flex-1 overflow-auto p-4"
      >
        <ActivePanel
          tabId={activeTab.id}
          labels={labels}
          milestones={milestones}
          milestoneMutations={milestoneMutations}
          onLabelUsageClick={onLabelUsageClick}
        />
      </div>
    </div>
  );
};
