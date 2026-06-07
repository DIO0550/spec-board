import { type ReactNode, useState } from "react";
import type { MilestonesResource } from "@/hooks/useMilestones";
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
  /** マイルストーンリソース（milestones タブへ配る） */
  milestones: MilestonesResource;
};

/**
 * アクティブタブ ID に対応するパネルを描画するコンポーネント。
 * id → コンポーネントの対応付けは view 層の責務として本コンポーネント（switch）に
 * 閉じ込め、タブのデータ型（SettingsTab）には持たせない。未知 id は描画しない。
 * @param props - tabId とリソースを含む props
 * @returns 対応するパネル要素、未知 id なら null
 */
const ActivePanel = ({ tabId, milestones }: ActivePanelProps): ReactNode => {
  switch (tabId) {
    case "labels":
      return <LabelSettingsTab />;
    case "milestones":
      return <MilestoneSettingsTab resource={milestones} />;
    case "appearance":
      return <AppearanceSettingsTab />;
    default:
      return null;
  }
};

type SettingsScreenProps = {
  /**
   * マイルストーンリソース。App が唯一の取得点（useMilestones）として保持するものを
   * 受け取り、board / milestoneView と共有する。設定タブでの CRUD 後の reload が
   * 同一リソースに効くため、バッジ / フィルタ / 専用ビューが即時に最新化される。
   */
  milestones: MilestonesResource;
};

/**
 * 設定画面本体。SubNav + アクティブタブのパネルを合成する。
 * board state には依存しない（App 側で保持・据え置き）。マイルストーンリソースは
 * App から共有で受け取る（独自取得はしない）。
 * @param props - {@link SettingsScreenProps}
 * @returns 設定画面要素
 */
export const SettingsScreen = ({ milestones }: SettingsScreenProps) => {
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
        <ActivePanel tabId={activeTab.id} milestones={milestones} />
      </div>
    </div>
  );
};
