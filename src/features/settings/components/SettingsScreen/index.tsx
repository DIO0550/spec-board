import { type ReactNode, useState } from "react";
import { type MilestonesResource, useMilestones } from "@/hooks/useMilestones";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { MilestoneSettingsTab } from "../MilestoneSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";

/** 設定画面に登録するタブ一覧（ラベル / マイルストーン）。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [
  { id: "labels", label: "ラベル" },
  { id: "milestones", label: "マイルストーン" },
];

/**
 * 設定画面が開いている間のマイルストーン取得を有効化する projectKey。
 * 設定画面は project オープン時のみ到達するため定数で有効化し、画面の再マウント
 * （view 切替）ごとに再取得される。
 */
const SETTINGS_PROJECT_KEY = "settings";

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
    default:
      return null;
  }
};

/**
 * 設定画面本体。SubNav + アクティブタブのパネルを合成する。
 * board state には依存しない（App 側で保持・据え置き）。マイルストーンリソースは
 * 本画面で取得し、milestones タブへ配る（唯一の取得点）。
 * @returns 設定画面要素
 */
export const SettingsScreen = () => {
  const [activeTabId, setActiveTabId] = useState<string>(SETTINGS_TABS[0].id);
  const activeTab = SettingsTab.selectActive(SETTINGS_TABS, activeTabId);
  const milestones = useMilestones(SETTINGS_PROJECT_KEY);

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
