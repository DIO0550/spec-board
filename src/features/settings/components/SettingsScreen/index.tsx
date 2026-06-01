import { type ReactNode, useState } from "react";
import { type NonEmptySettingsTabs, SettingsTab } from "../../types";
import { LabelSettingsTab } from "../LabelSettingsTab";
import { SubNav, subNavPanelId, subNavTabId } from "../SubNav";

/** 設定画面に登録するタブ一覧（現状はラベルタブ 1 枠。NonEmptySettingsTabs で 1 件以上を保証）。 */
const SETTINGS_TABS: NonEmptySettingsTabs = [{ id: "labels", label: "ラベル" }];

/**
 * アクティブタブ ID に対応するパネルを描画する。
 * id → コンポーネントの対応付けは view 層の責務として本関数（switch）に閉じ込め、
 * タブのデータ型（SettingsTab）には持たせない。返すのは要素なので各パネルは
 * 独自の reconciliation 境界・hooks state を持つ。未知 id は描画しない。
 * @param id アクティブタブの識別子
 * @returns 対応するパネル要素、未知 id なら null
 */
const renderActivePanel = (id: string): ReactNode => {
  switch (id) {
    case "labels":
      return <LabelSettingsTab />;
    default:
      return null;
  }
};

/**
 * 設定画面本体。SubNav + アクティブタブのパネルを合成する。
 * board state には依存しない（App 側で保持・据え置き）。
 * @returns 設定画面要素
 */
export const SettingsScreen = () => {
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
        {renderActivePanel(activeTab.id)}
      </div>
    </div>
  );
};
